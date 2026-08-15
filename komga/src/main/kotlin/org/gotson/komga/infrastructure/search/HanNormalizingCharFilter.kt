package org.gotson.komga.infrastructure.search

import com.ibm.icu.text.Transliterator
import org.apache.lucene.analysis.CharFilter
import java.io.Reader
import java.io.StringReader

/**
 * Normalizes Traditional Chinese characters to Simplified Chinese before tokenization.
 *
 * It is applied to the token stream of both the index and search analyzers, so a full-text
 * search for either variant matches both: entering 简体 characters also finds 繁體 titles/names
 * (and vice-versa), regardless of which script the library actually uses.
 */
class HanNormalizingCharFilter(
  `in`: Reader,
) : CharFilter(StringReader(HanNormalizing.hanToSimplified(`in`.readText()))) {

  override fun correct(currentOff: Int): Int = currentOff

  // ICU4J transliterators are thread-safe and keep no per-call state.
  private object HanNormalizing {
    private val traditionalToSimplified = Transliterator.getInstance("Traditional-Simplified")
    fun hanToSimplified(text: String): String = traditionalToSimplified.transliterate(text)
  }
}