package org.gotson.komga.infrastructure.search

import com.ibm.icu.text.Transliterator
import java.io.Reader
import java.io.StringReader

/**
 * Normalizes Traditional Chinese characters to Simplified Chinese before tokenization.
 *
 * It is applied to both the index and search analyzers, so a full-text search for either
 * variant matches titles and names stored in either script.
 */
object HanTextNormalizer {
  private val traditionalToSimplified = ThreadLocal.withInitial {
    Transliterator.getInstance("Traditional-Simplified")
  }

  fun normalize(reader: Reader): Reader =
    StringReader(traditionalToSimplified.get().transliterate(reader.readText()))
}
