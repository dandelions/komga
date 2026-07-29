package org.gotson.komga.domain.service

import com.google.common.jimfs.Configuration
import com.google.common.jimfs.Jimfs
import org.apache.commons.io.FilenameUtils
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.catchThrowable
import org.gotson.komga.domain.model.DirectoryNotFoundException
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.Arguments
import org.junit.jupiter.params.provider.MethodSource
import java.nio.file.Files
import java.nio.file.Path
import java.util.stream.Stream

class FileSystemScannerTest {
  private val scanner = FileSystemScanner(emptyList(), emptyList())

  @Test
  fun `given unavailable root directory when scanning then throw exception`() {
    Jimfs.newFileSystem(Configuration.unix()).use { fs ->
      // given
      val root = fs.getPath("/root")

      // when
      val thrown = catchThrowable { scanner.scanRootFolder(root) }

      // then
      assertThat(thrown).isInstanceOf(DirectoryNotFoundException::class.java)
    }
  }

  @Test
  fun `given empty root directory when scanning then return empty list`() {
    Jimfs.newFileSystem(Configuration.unix()).use { fs ->
      // given
      val root = fs.getPath("/root")
      Files.createDirectory(root)

      // when
      val scan = scanner.scanRootFolder(root).series

      // then
      assertThat(scan).isEmpty()
    }
  }

  @Test
  fun `given root directory with only files when scanning then return 1 series containing those files as books`() {
    Jimfs.newFileSystem(Configuration.unix()).use { fs ->
      // given
      val root = fs.getPath("/root")
      Files.createDirectory(root)

      val files = listOf("file1.cbz", "file2.cbz")
      files.forEach { Files.createFile(root.resolve(it)) }

      // when
      val scan = scanner.scanRootFolder(root).series
      val series = scan.keys.first()
      val books = scan.getValue(series)

      // then
      assertThat(scan).hasSize(1)
      assertThat(books).hasSize(2)
      assertThat(books.map { it.name }).containsExactlyInAnyOrderElementsOf(files.map { FilenameUtils.removeExtension(it) })
    }
  }

  @Test
  fun `given max counted books when scanning then stop before exceeding counted book limit`() {
    Jimfs.newFileSystem(Configuration.unix()).use { fs ->
      // given
      val root = fs.getPath("/root")
      Files.createDirectory(root)

      listOf("file1.cbz", "file2.cbz").forEach { Files.createFile(root.resolve(it)) }

      // when
      val scanResult = scanner.scanRootFolder(root, maxCountedBooks = 1)

      // then
      assertThat(scanResult.limited).isTrue
      assertThat(scanResult.countedBookCount).isEqualTo(1)
      assertThat(scanResult.scannedBookCount).isEqualTo(1)
    }
  }

  @Test
  fun `given max counted books when scanning then uncounted books do not consume the limit`() {
    Jimfs.newFileSystem(Configuration.unix()).use { fs ->
      // given
      val root = fs.getPath("/root")
      Files.createDirectory(root)

      listOf("unchanged.cbz", "changed.cbz").forEach { Files.createFile(root.resolve(it)) }

      // when
      val scanResult = scanner.scanRootFolder(root, maxCountedBooks = 1, countBook = { book -> book.name == "changed" })

      // then
      assertThat(scanResult.limited).isFalse
      assertThat(scanResult.countedBookCount).isEqualTo(1)
      assertThat(scanResult.scannedBookCount).isEqualTo(2)
      val scannedNames =
        scanResult.series
          .values
          .flatten()
          .map { it.name }
      assertThat(scannedNames).containsExactlyInAnyOrder("unchanged", "changed")
    }
  }

  @Test
  fun `given counted book cannot be consumed when scanning then stop before adding it`() {
    Jimfs.newFileSystem(Configuration.unix()).use { fs ->
      // given
      val root = fs.getPath("/root")
      Files.createDirectory(root)

      listOf("file1.cbz", "file2.cbz").forEach { Files.createFile(root.resolve(it)) }
      var consumedBooks = 0

      // when
      val scanResult =
        scanner.scanRootFolder(
          root,
          maxCountedBooks = 10,
          consumeCountedBook = { consumedBooks++ == 0 },
        )

      // then
      assertThat(scanResult.limited).isTrue
      assertThat(scanResult.countedBookCount).isEqualTo(1)
      assertThat(scanResult.scannedBookCount).isEqualTo(1)
    }
  }

  @Test
  fun `given root directory as filesystem root when scanning then return 1 series containing those files as books`() {
    Jimfs.newFileSystem(Configuration.unix()).use { fs ->
      // given
      val root = fs.getPath("/")

      val files = listOf("file1.cbz", "file2.cbz")
      files.forEach { Files.createFile(root.resolve(it)) }

      // when
      val scan = scanner.scanRootFolder(root).series
      val series = scan.keys.first()
      val books = scan.getValue(series)

      // then
      assertThat(scan).hasSize(1)
      assertThat(series.name).isEqualTo("/")
      assertThat(books).hasSize(2)
      assertThat(books.map { it.name }).containsExactlyInAnyOrderElementsOf(files.map { FilenameUtils.removeExtension(it) })
    }
  }

  @Test
  fun `given directory with unsupported files when scanning then return a series excluding those files as books`() {
    Jimfs.newFileSystem(Configuration.unix()).use { fs ->
      // given
      val root = fs.getPath("/root")
      Files.createDirectory(root)

      val files = listOf("file1.cbz", "file2.txt", "file3")
      files.forEach { Files.createFile(root.resolve(it)) }

      // when
      val scan = scanner.scanRootFolder(root).series
      val series = scan.keys.first()
      val books = scan.getValue(series)

      // then
      assertThat(scan).hasSize(1)
      assertThat(books).hasSize(1)
      assertThat(books.map { it.name }).containsExactly("file1")
    }
  }

  @ParameterizedTest
  @MethodSource("libraryScanFileTypesArguments")
  fun `given directory when scanning excluding some files then return a series excluding those files as books`(
    sourceFiles: List<String>,
    scanCbz: Boolean,
    scanPdf: Boolean,
    scanEpub: Boolean,
    resultBookNames: List<String>,
  ) {
    Jimfs.newFileSystem(Configuration.unix()).use { fs ->
      // given
      val root = fs.getPath("/root")
      Files.createDirectory(root)

      sourceFiles.forEach { Files.createFile(root.resolve(it)) }

      // when
      val scan = scanner.scanRootFolder(root, scanCbx = scanCbz, scanPdf = scanPdf, scanEpub = scanEpub).series

      // then
      if (resultBookNames.isNotEmpty()) {
        assertThat(scan).hasSize(1)
        val books = scan.getValue(scan.keys.first())
        assertThat(books).hasSameSizeAs(resultBookNames)
        assertThat(books.map { it.name }).containsExactlyInAnyOrderElementsOf(resultBookNames)
      } else {
        assertThat(scan).isEmpty()
      }
    }
  }

  private fun libraryScanFileTypesArguments(): Stream<Arguments> {
    val sourceFiles = listOf("cbz.cbz", "cbr.cbr", "zip.zip", "rar.rar", "pdf.pdf", "djvu.djvu", "djv.djv", "epub.epub", "mobi.mobi", "azw3.azw3")
    return Stream.of(
      Arguments.of(sourceFiles, true, true, true, listOf("cbz", "cbr", "zip", "rar", "pdf", "djvu", "djv", "epub", "mobi", "azw3")),
      Arguments.of(sourceFiles, false, true, true, listOf("pdf", "djvu", "djv", "epub", "mobi", "azw3")),
      Arguments.of(sourceFiles, true, false, true, listOf("cbz", "cbr", "zip", "rar", "epub", "mobi", "azw3")),
      Arguments.of(sourceFiles, true, true, false, listOf("cbz", "cbr", "zip", "rar", "pdf", "djvu", "djv")),
      Arguments.of(sourceFiles, false, false, true, listOf("epub", "mobi", "azw3")),
      Arguments.of(sourceFiles, true, false, false, listOf("cbz", "cbr", "zip", "rar")),
      Arguments.of(sourceFiles, false, true, false, listOf("pdf", "djvu", "djv")),
      Arguments.of(sourceFiles, false, false, false, emptyList<String>()),
    )
  }

  @Test
  fun `given directory with sub-directories containing files when scanning then return 1 series per folder containing direct files as books`() {
    Jimfs.newFileSystem(Configuration.unix()).use { fs ->
      // given
      val root = fs.getPath("/root")
      Files.createDirectory(root)

      val subDirs =
        listOf(
          "series1" to listOf("volume1.cbz", "volume2.cbz"),
          "series2" to listOf("book1.cbz", "book2.cbz"),
        ).toMap()

      subDirs.forEach { (dir, files) ->
        makeSubDir(root, dir, files)
      }

      // when
      val scan = scanner.scanRootFolder(root).series
      val series = scan.keys

      // then
      assertThat(scan).hasSize(2)

      assertThat(series.map { it.name }).containsExactlyInAnyOrderElementsOf(subDirs.keys)
      series.forEach { s ->
        assertThat(
          scan.getValue(s).map { it.name },
        ).containsExactlyInAnyOrderElementsOf(
          subDirs[s.name]?.map {
            FilenameUtils.removeExtension(
              it,
            )
          },
        )
      }
    }
  }

  @Test
  fun `given symlink root directory when scanning then return series and books`() {
    Jimfs.newFileSystem(Configuration.unix()).use { fs ->
      // given
      val root = fs.getPath("/root")
      Files.createDirectory(root)

      val link = fs.getPath("/link")
      Files.createSymbolicLink(link, root)

      val subDirs =
        listOf(
          "series1" to listOf("volume1.cbz", "volume2.cbz"),
          "series2" to listOf("book1.cbz", "book2.cbz"),
        ).toMap()

      subDirs.forEach { (dir, files) ->
        makeSubDir(root, dir, files)
      }

      // when
      val scan = scanner.scanRootFolder(link).series
      val series = scan.keys

      // then
      assertThat(scan).hasSize(2)

      assertThat(series.map { it.name }).containsExactlyInAnyOrderElementsOf(subDirs.keys)
      series.forEach { s ->
        assertThat(
          scan.getValue(s).map { it.name },
        ).containsExactlyInAnyOrderElementsOf(
          subDirs[s.name]?.map {
            FilenameUtils.removeExtension(
              it,
            )
          },
        )
      }
    }
  }

  @Test
  fun `given root directory with symlinks when scanning then return series and books`() {
    Jimfs.newFileSystem(Configuration.unix()).use { fs ->
      // given
      val root = fs.getPath("/root")
      Files.createDirectory(root)

      val subDirs =
        listOf(
          "series1" to listOf("volume1.cbz", "volume2.cbz"),
          "series2" to listOf("book1.cbz", "book2.cbz"),
        ).toMap()

      subDirs.forEach { (dir, files) ->
        makeSubDir(root, dir, files)
        Files.createSymbolicLink(root.resolve("${dir}_link"), root.resolve(dir))
      }

      // when
      val scan = scanner.scanRootFolder(root).series
      val series = scan.keys

      // then
      assertThat(scan).hasSize(4)

      assertThat(series.map { it.name }).containsExactlyInAnyOrderElementsOf(subDirs.keys + subDirs.keys.map { "${it}_link" })
      series.forEach { s ->
        assertThat(
          scan.getValue(s).map { it.name },
        ).containsExactlyInAnyOrderElementsOf(
          subDirs[s.name.removeSuffix("_link")]?.map {
            FilenameUtils.removeExtension(
              it,
            )
          },
        )
      }
    }
  }

  @Test
  fun `given directory structure with excluded directories when scanning then excluded directories are not returned`() {
    Jimfs.newFileSystem(Configuration.unix()).use { fs ->
      // given
      val root = fs.getPath("/root")
      Files.createDirectory(root)

      val dir1 = makeSubDir(root, "dir1", listOf("comic.cbz"))
      makeSubDir(dir1, "subdir1", listOf("comic2.cbz"))
      val recycle = makeSubDir(root, "#recycle", listOf("trash.cbz"))
      makeSubDir(recycle, "subtrash", listOf("trash2.cbz"))

      // when
      val scan = scanner.scanRootFolder(root, directoryExclusions = setOf("#recycle")).series

      // then
      assertThat(scan).hasSize(2)

      assertThat(scan.keys.map { it.name }).containsExactlyInAnyOrder("dir1", "subdir1")
      assertThat(scan.values.flatMap { list -> list.map { it.name } }).containsExactlyInAnyOrder("comic", "comic2")
    }
  }

  @Test
  fun `given excluded paths when scanning then excluded files and subtrees are not returned`() {
    Jimfs.newFileSystem(Configuration.unix()).use { fs ->
      val root = fs.getPath("/root")
      Files.createDirectory(root)
      val included = makeSubDir(root, "included", listOf("keep.cbz", "skip.cbz"))
      val excluded = makeSubDir(root, "excluded", listOf("hidden.cbz"))

      val scan =
        scanner
          .scanRootFolder(
            root,
            excludedPaths = setOf(included.resolve("skip.cbz"), excluded),
          ).series

      assertThat(scan.keys.map { it.name }).containsExactly("included")
      assertThat(scan.values.flatten().map { it.name }).containsExactly("keep")
    }
  }

  @Test
  fun `given directory structure with hidden directories when scanning then hidden directories are not returned`() {
    Jimfs.newFileSystem(Configuration.unix()).use { fs ->
      // given
      val root = fs.getPath("/root")
      Files.createDirectory(root)

      val dir1 = makeSubDir(root, "dir1", listOf("comic.cbz"))
      makeSubDir(dir1, "subdir1", listOf("comic2.cbz"))
      val hidden = makeSubDir(root, ".hidden", listOf("hidden.cbz"))
      makeSubDir(hidden, "subhidden", listOf("hidden2.cbz"))

      // when
      val scan = scanner.scanRootFolder(root).series

      // then
      assertThat(scan).hasSize(2)

      assertThat(scan.keys.map { it.name }).containsExactlyInAnyOrder("dir1", "subdir1")
      assertThat(scan.values.flatMap { list -> list.map { it.name } }).containsExactlyInAnyOrder("comic", "comic2")
    }
  }

  @Test
  fun `given directory structure with hidden files when scanning then hidden files are not returned`() {
    Jimfs.newFileSystem(Configuration.unix()).use { fs ->
      // given
      val root = fs.getPath("/root")
      Files.createDirectory(root)

      val dir1 = makeSubDir(root, "dir1", listOf("comic.cbz"))
      makeSubDir(dir1, "subdir1", listOf("comic2.cbz", ".comic2.cbz"))

      // when
      val scan = scanner.scanRootFolder(root).series

      // then
      assertThat(scan).hasSize(2)

      assertThat(scan.keys.map { it.name }).containsExactlyInAnyOrder("dir1", "subdir1")
      assertThat(scan.values.flatMap { list -> list.map { it.name } }).containsExactlyInAnyOrder("comic", "comic2")
    }
  }

  @Test
  fun `given file with mixed-case extension when scanning then files are returned`() {
    Jimfs.newFileSystem(Configuration.unix()).use { fs ->
      // given
      val root = fs.getPath("/root")
      Files.createDirectory(root)

      makeSubDir(root, "dir1", listOf("comic.Cbz", "comic2.CBR"))

      // when
      val scan = scanner.scanRootFolder(root).series

      // then
      assertThat(scan).hasSize(1)

      assertThat(scan.keys.map { it.name }).containsExactlyInAnyOrder("dir1")
      assertThat(scan.values.flatMap { list -> list.map { it.name } }).containsExactlyInAnyOrder("comic", "comic2")
    }
  }

  @Test
  fun `given oneshot directory when scanning then return a series per file`() {
    Jimfs.newFileSystem(Configuration.unix()).use { fs ->
      // given
      val root = fs.getPath("/root")
      Files.createDirectory(root)

      val normal = makeSubDir(root, "normal", listOf("comic.cbz"))
      makeSubDir(normal, "_oneshots", listOf("single4.cbz", "single5.cbz"))
      makeSubDir(root, "_oneshots", listOf("single.cbz", "single2.cbz", "single3.cbz"))

      // when
      val scan = scanner.scanRootFolder(root, oneshotsDir = "_oneshots").series

      // then
      assertThat(scan).hasSize(6)
      assertThat(scan.keys.map { it.name })
        .containsExactlyInAnyOrder("normal", "single", "single2", "single3", "single4", "single5")
        .doesNotContain("_oneshots")
      val (oneshots, regular) = scan.keys.partition { it.name.startsWith("single") }
      assertThat(oneshots.map { it.oneshot }).containsOnly(true)
      assertThat(oneshots.flatMap { scan[it] ?: emptyList() }.map { it.oneshot }).containsOnly(true)
      assertThat(regular.map { it.oneshot }).containsOnly(false)
      assertThat(regular.flatMap { scan[it] ?: emptyList() }.map { it.oneshot }).containsOnly(false)

      scan.forEach { (_, books) ->
        assertThat(books).hasSize(1)
      }
    }
  }

  private fun makeSubDir(
    root: Path,
    name: String,
    files: List<String>,
  ): Path {
    val dir = root.resolve(name)
    Files.createDirectory(dir)
    files.forEach { Files.createFile(root.resolve(root.fileSystem.getPath(name, it))) }
    return dir
  }
}
