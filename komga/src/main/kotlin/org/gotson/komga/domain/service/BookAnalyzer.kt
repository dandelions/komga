package org.gotson.komga.domain.service

import io.github.oshai.kotlinlogging.KotlinLogging
import org.gotson.komga.domain.model.Book
import org.gotson.komga.domain.model.BookPage
import org.gotson.komga.domain.model.BookWithMedia
import org.gotson.komga.domain.model.Dimension
import org.gotson.komga.domain.model.Media
import org.gotson.komga.domain.model.MediaExtensionEpub
import org.gotson.komga.domain.model.MediaFile
import org.gotson.komga.domain.model.MediaNotReadyException
import org.gotson.komga.domain.model.MediaProfile
import org.gotson.komga.domain.model.MediaType
import org.gotson.komga.domain.model.MediaUnsupportedException
import org.gotson.komga.domain.model.NoThumbnailFoundException
import org.gotson.komga.domain.model.ThumbnailBook
import org.gotson.komga.domain.model.TypedBytes
import org.gotson.komga.infrastructure.configuration.KomgaSettingsProvider
import org.gotson.komga.infrastructure.hash.Hasher
import org.gotson.komga.infrastructure.image.ImageAnalyzer
import org.gotson.komga.infrastructure.image.ImageConverter
import org.gotson.komga.infrastructure.image.ImageType
import org.gotson.komga.infrastructure.mediacontainer.ContentDetector
import org.gotson.komga.infrastructure.mediacontainer.divina.DivinaExtractor
import org.gotson.komga.infrastructure.mediacontainer.djvu.DjvuExtractor
import org.gotson.komga.infrastructure.mediacontainer.epub.EbookConversionException
import org.gotson.komga.infrastructure.mediacontainer.epub.EbookConverter
import org.gotson.komga.infrastructure.mediacontainer.epub.EpubExtractor
import org.gotson.komga.infrastructure.mediacontainer.epub.epub
import org.gotson.komga.infrastructure.mediacontainer.pdf.PdfExtractor
import org.gotson.komga.infrastructure.mediacontainer.pdf.PdfTocEntry
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.io.ByteArrayOutputStream
import java.nio.file.AccessDeniedException
import java.nio.file.NoSuchFileException
import java.nio.file.Path
import javax.imageio.ImageIO
import kotlin.io.path.extension

private val logger = KotlinLogging.logger {}

@Service
class BookAnalyzer(
  private val contentDetector: ContentDetector,
  extractors: List<DivinaExtractor>,
  private val pdfExtractor: PdfExtractor,
  private val djvuExtractor: DjvuExtractor,
  private val ebookConverter: EbookConverter,
  private val epubExtractor: EpubExtractor,
  private val imageConverter: ImageConverter,
  private val imageAnalyzer: ImageAnalyzer,
  private val hasher: Hasher,
  @param:Value("#{@komgaProperties.pageHashing}") private val pageHashing: Int,
  private val komgaSettingsProvider: KomgaSettingsProvider,
  @Qualifier("thumbnailType")
  private val thumbnailType: ImageType,
  @Qualifier("pdfImageType")
  private val pdfImageType: ImageType,
) {
  val divinaExtractors =
    extractors
      .flatMap { e -> e.mediaTypes().map { it to e } }
      .toMap()

  fun analyze(
    book: Book,
    analyzeDimensions: Boolean,
  ): Media {
    logger.info { "Trying to analyze book: $book" }
    return try {
      val mediaTypeFromExtension =
        when (book.path.extension.lowercase()) {
          "djvu", "djv" -> MediaType.DJVU
          "mobi" -> MediaType.MOBI
          "azw3" -> MediaType.AZW3
          else -> null
        }

      var mediaType =
        contentDetector.detectMediaType(book.path).let {
          logger.info { "Detected media type: $it" }
          mediaTypeFromExtension
            ?: MediaType.fromMediaType(it)
            ?: return Media(mediaType = it, status = Media.Status.UNSUPPORTED, comment = "ERR_1001", bookId = book.id)
        }

      if (book.path.extension.lowercase() == "epub" && mediaType != MediaType.EPUB) {
        if (epubExtractor.isEpub(book.path)) {
          mediaType = MediaType.EPUB
        } else {
          logger.warn { "Epub file is malformed, file is probably broken: ${book.path}" }
          return Media(mediaType = mediaType.type, status = Media.Status.ERROR, comment = "ERR_1032", bookId = book.id)
        }
      }

      when (mediaType.profile) {
        MediaProfile.DIVINA -> analyzeDivina(book, mediaType, analyzeDimensions)
        MediaProfile.PDF -> analyzePdf(book, mediaType, analyzeDimensions)
        MediaProfile.EPUB ->
          when (mediaType) {
            MediaType.EPUB -> analyzeEpub(book, book.path, analyzeDimensions)
            MediaType.MOBI, MediaType.AZW3 -> analyzeConvertedEpub(book, analyzeDimensions)
            else -> Media(status = Media.Status.UNSUPPORTED)
          }
      }.copy(mediaType = mediaType.type)
    } catch (ade: AccessDeniedException) {
      logger.error(ade) { "Error while analyzing book: $book" }
      Media(status = Media.Status.ERROR, comment = "ERR_1000")
    } catch (ex: NoSuchFileException) {
      logger.error(ex) { "Error while analyzing book: $book" }
      Media(status = Media.Status.ERROR, comment = "ERR_1018")
    } catch (ex: Exception) {
      logger.error(ex) { "Error while analyzing book: $book" }
      Media(status = Media.Status.ERROR, comment = "ERR_1005")
    }.copy(bookId = book.id)
  }

  private fun analyzeDivina(
    book: Book,
    mediaType: MediaType,
    analyzeDimensions: Boolean,
  ): Media {
    val entries =
      try {
        divinaExtractors[mediaType.type]?.getEntries(book.path, analyzeDimensions)
          ?: return Media(status = Media.Status.UNSUPPORTED)
      } catch (ex: MediaUnsupportedException) {
        return Media(status = Media.Status.UNSUPPORTED, comment = ex.code)
      } catch (ex: Exception) {
        logger.error(ex) { "Error while analyzing book: $book" }
        return Media(status = Media.Status.ERROR, comment = "ERR_1008")
      }

    val (pages, others) =
      entries
        .partition { entry ->
          entry.mediaType?.let { contentDetector.isImage(it) } ?: false
        }.let { (images, others) ->
          Pair(
            images.map { BookPage(fileName = it.name, mediaType = it.mediaType!!, dimension = it.dimension, fileSize = it.fileSize) },
            others,
          )
        }

    val entriesErrorSummary =
      others
        .filter { it.mediaType.isNullOrBlank() }
        .map { it.name }
        .ifEmpty { null }
        ?.joinToString(prefix = "ERR_1007 [", postfix = "]") { it }

    if (pages.isEmpty()) {
      logger.warn { "Book $book does not contain any pages" }
      return Media(status = Media.Status.ERROR, comment = "ERR_1006")
    }
    logger.info { "Book has ${pages.size} pages" }

    val files = others.map { MediaFile(fileName = it.name, mediaType = it.mediaType, fileSize = it.fileSize) }

    return Media(status = Media.Status.READY, pages = pages, pageCount = pages.size, files = files, comment = entriesErrorSummary)
  }

  private fun analyzeEpub(
    book: Book,
    epubPath: Path,
    analyzeDimensions: Boolean,
  ): Media {
    epubPath.epub { epub ->
      val (resources, missingResources) = epubExtractor.getResources(epub).partition { it.fileSize != null }
      val isKepub = epubExtractor.isKepub(epub, resources)

      val errors = mutableListOf<String>()

      val toc =
        try {
          epubExtractor.getToc(epub)
        } catch (e: Exception) {
          logger.error(e) { "Error while getting EPUB TOC" }
          errors.add("ERR_1035")
          emptyList()
        }

      val landmarks =
        try {
          epubExtractor.getLandmarks(epub)
        } catch (e: Exception) {
          logger.error(e) { "Error while getting EPUB Landmarks" }
          errors.add("ERR_1036")
          emptyList()
        }

      val pageList =
        try {
          epubExtractor.getPageList(epub)
        } catch (e: Exception) {
          logger.error(e) { "Error while getting EPUB page list" }
          errors.add("ERR_1037")
          emptyList()
        }

      val divinaPages =
        try {
          epubExtractor.getDivinaPages(epub, analyzeDimensions)
        } catch (e: Exception) {
          logger.error(e) { "Error while getting EPUB Divina pages" }
          errors.add("ERR_1038")
          emptyList()
        }

      val isFixedLayout = divinaPages.isNotEmpty() || epubExtractor.isFixedLayout(epub)

      val positions =
        try {
          epubExtractor.computePositions(epub, epubPath, resources, isFixedLayout, isKepub)
        } catch (e: Exception) {
          logger.error(e) { "Error while getting EPUB positions" }
          errors.add("ERR_1039")
          emptyList()
        }

      val entriesErrorSummary =
        missingResources
          .map { it.fileName }
          .ifEmpty { null }
          ?.joinToString(prefix = "ERR_1033 [", postfix = "]") { it }

      val allErrors =
        (errors + entriesErrorSummary)
          .filterNotNull()
          .joinToString(" ")
          .ifBlank { null }

      return Media(
        status = Media.Status.READY,
        pages = divinaPages,
        files = resources,
        pageCount = if (divinaPages.isNotEmpty()) divinaPages.size else epubExtractor.computePageCount(epub),
        epubDivinaCompatible = divinaPages.isNotEmpty(),
        epubIsKepub = isKepub,
        extension =
          MediaExtensionEpub(
            toc = toc,
            landmarks = landmarks,
            pageList = pageList,
            isFixedLayout = isFixedLayout,
            positions = positions,
          ),
        comment = allErrors,
      )
    }
  }

  private fun analyzeConvertedEpub(
    book: Book,
    analyzeDimensions: Boolean,
  ): Media =
    try {
      analyzeEpub(book, ebookConverter.getOrConvertToEpub(book.path), analyzeDimensions)
    } catch (e: EbookConversionException) {
      logger.error(e) { "Error while converting ebook to EPUB: $book" }
      Media(status = Media.Status.ERROR, comment = "ERR_1040")
    }

  private fun analyzePdf(
    book: Book,
    mediaType: MediaType,
    analyzeDimensions: Boolean,
  ): Media {
    val entries =
      when (mediaType) {
        MediaType.PDF -> pdfExtractor.getPages(book.path, analyzeDimensions)
        MediaType.DJVU, MediaType.DJVU_X, MediaType.DJVU_APPLICATION -> djvuExtractor.getPages(book.path, analyzeDimensions)
        else -> throw MediaUnsupportedException("Unsupported PDF profile media type: ${mediaType.type}")
      }
    val pages = entries.map { BookPage(it.name, "", it.dimension) }
    return Media(status = Media.Status.READY, pages = pages)
  }

  @Throws(
    MediaNotReadyException::class,
    NoThumbnailFoundException::class,
  )
  fun generateThumbnail(book: BookWithMedia): ThumbnailBook {
    logger.info { "Generate thumbnail for book: $book" }

    if (book.media.status != Media.Status.READY) {
      logger.warn { "Book media is not ready, cannot generate thumbnail. Book: $book" }
      throw MediaNotReadyException()
    }

    val thumbnail =
      getPoster(book)?.let { cover ->
        imageConverter.resizeImageToByteArray(cover.bytes, thumbnailType, komgaSettingsProvider.thumbnailSize.maxEdge)
      } ?: throw NoThumbnailFoundException()

    return ThumbnailBook(
      thumbnail = thumbnail,
      type = ThumbnailBook.Type.GENERATED,
      bookId = book.book.id,
      mediaType = thumbnailType.mediaType,
      dimension = imageAnalyzer.getDimension(thumbnail.inputStream()) ?: Dimension(0, 0),
      fileSize = thumbnail.size.toLong(),
    )
  }

  fun getPoster(book: BookWithMedia): TypedBytes? =
    when (book.media.profile) {
      MediaProfile.DIVINA -> divinaExtractors[book.media.mediaType]?.getPoster(book)
      MediaProfile.PDF ->
        when (book.media.mediaType) {
          MediaType.PDF.type -> pdfExtractor.getPageContentAsImage(book.book.path, 1)
          MediaType.DJVU.type, MediaType.DJVU_X.type, MediaType.DJVU_APPLICATION.type -> djvuExtractor.getPageContentAsImage(book.book.path, 1)
          else -> null
        }
      MediaProfile.EPUB -> {
        val epubPath = book.epubPath()
        epubExtractor.getCover(epubPath)
          ?: if (book.book.path == epubPath && book.media.epubDivinaCompatible) divinaExtractors[MediaType.ZIP.type]?.getPoster(book) else null
      }
      null -> null
    }

  private fun DivinaExtractor.getPoster(book: BookWithMedia): TypedBytes =
    this
      .getEntryStream(
        book.book.path,
        book.media.pages
          .first()
          .fileName,
      ).let {
        TypedBytes(
          it,
          book.media.pages
            .first()
            .mediaType,
        )
      }

  @Throws(
    MediaNotReadyException::class,
    IndexOutOfBoundsException::class,
  )
  fun getPageContent(
    book: BookWithMedia,
    number: Int,
  ): ByteArray {
    logger.debug { "Get page #$number for book: $book" }

    if (book.media.status != Media.Status.READY) {
      logger.warn { "Book media is not ready, cannot get pages" }
      throw MediaNotReadyException()
    }

    if (number > book.media.pageCount || number <= 0) {
      logger.error { "Page number #$number is out of bounds. Book has ${book.media.pageCount} pages" }
      throw IndexOutOfBoundsException("Page $number does not exist")
    }

    return when (book.media.profile) {
      MediaProfile.DIVINA -> divinaExtractors.getValue(book.media.mediaType!!).getEntryStream(book.book.path, book.media.pages[number - 1].fileName)
      MediaProfile.PDF ->
        when (book.media.mediaType) {
          MediaType.PDF.type -> pdfExtractor.getPageContentAsImage(book.book.path, number).bytes
          MediaType.DJVU.type, MediaType.DJVU_X.type, MediaType.DJVU_APPLICATION.type -> djvuExtractor.getPageContentAsImage(book.book.path, number).bytes
          else -> throw MediaUnsupportedException("Unsupported PDF profile media type: ${book.media.mediaType}")
        }
      MediaProfile.EPUB ->
        if (book.media.epubDivinaCompatible)
          epubExtractor.getEntryStream(book.epubPath(), book.media.pages[number - 1].fileName)
        else
          throw MediaUnsupportedException("Epub profile does not support getting page content")

      null -> throw MediaNotReadyException()
    }
  }

  @Throws(
    MediaNotReadyException::class,
    IndexOutOfBoundsException::class,
  )
  fun getPageContentRaw(
    book: BookWithMedia,
    number: Int,
  ): TypedBytes {
    logger.debug { "Get raw page #$number for book: $book" }
    if (book.media.mediaType != MediaType.PDF.type) throw MediaUnsupportedException("Extractor does not support raw extraction of pages")

    if (book.media.status != Media.Status.READY) {
      logger.warn { "Book media is not ready, cannot get pages" }
      throw MediaNotReadyException()
    }

    if (number > book.media.pageCount || number <= 0) {
      logger.error { "Page number #$number is out of bounds. Book has ${book.media.pageCount} pages" }
      throw IndexOutOfBoundsException("Page $number does not exist")
    }

    return pdfExtractor.getPageContentAsPdf(book.book.path, number)
  }

  @Throws(
    MediaNotReadyException::class,
  )
  fun getFileContent(
    book: BookWithMedia,
    fileName: String,
  ): ByteArray {
    logger.debug { "Get file $fileName for book: $book" }

    if (book.media.status != Media.Status.READY) {
      logger.warn { "Book media is not ready, cannot get files" }
      throw MediaNotReadyException()
    }

    return when (book.media.profile) {
      MediaProfile.DIVINA -> divinaExtractors.getValue(book.media.mediaType!!).getEntryStream(book.book.path, fileName)
      MediaProfile.EPUB -> epubExtractor.getEntryStream(book.epubPath(), fileName)
      MediaProfile.PDF, null -> throw MediaUnsupportedException("Extractor does not support extraction of files")
    }
  }

  private fun BookWithMedia.epubPath(): Path =
    when (media.mediaType) {
      MediaType.MOBI.type, MediaType.AZW3.type -> ebookConverter.getOrConvertToEpub(book.path)
      else -> book.path
    }

  /**
   * Will hash the first and last pages of the given book.
   * The number of pages hashed from start/end is configurable.
   *
   * See [org.gotson.komga.infrastructure.configuration.KomgaProperties.pageHashing]
   */
  fun hashPages(book: BookWithMedia): Media {
    val hashedPages =
      book.media.pages.mapIndexed { index, bookPage ->
        if (bookPage.fileHash.isBlank() && (index < pageHashing || index >= (book.media.pageCount - pageHashing))) {
          val content = getPageContent(book, index + 1)
          val hash = hashPage(bookPage, content)
          bookPage.copy(fileHash = hash)
        } else {
          bookPage
        }
      }

    return book.media.copy(pages = hashedPages)
  }

  /**
   * Hash a single page, using the file content for hashing.
   *
   * For JPEG, the image is read/written to remove the metadata.
   */
  fun hashPage(
    page: BookPage,
    content: ByteArray,
  ): String {
    val bytes =
      if (page.mediaType == ImageType.JPEG.mediaType) {
        // JPEG could contain different EXIF data, reading and writing back the image will get rid of it
        ByteArrayOutputStream().use { buffer ->
          ImageIO.write(ImageIO.read(content.inputStream()), ImageType.JPEG.imageIOFormat, buffer)
          buffer.toByteArray()
        }
      } else {
        content
      }

    return hasher.computeHash(bytes.inputStream())
  }

  fun getPdfPagesDynamic(media: Media): List<BookPage> {
    if (media.profile != MediaProfile.PDF) throw MediaUnsupportedException("Cannot get synthetic pages for non-PDF media")

    return media.pages.map { page ->
      page.copy(
        mediaType = pdfImageType.mediaType,
        dimension = if (media.mediaType == MediaType.PDF.type) page.dimension?.let { pdfExtractor.scaleDimension(it) } else page.dimension,
      )
    }
  }

  fun getPdfToc(
    book: Book,
    mediaType: String?,
  ): List<PdfTocEntry> =
    try {
      when (mediaType) {
        MediaType.PDF.type -> pdfExtractor.getToc(book.path)
        MediaType.DJVU.type, MediaType.DJVU_X.type, MediaType.DJVU_APPLICATION.type -> djvuExtractor.getToc(book.path)
        else -> emptyList()
      }
    } catch (e: Exception) {
      logger.error(e) { "Error while getting PDF profile TOC" }
      emptyList()
    }
}
