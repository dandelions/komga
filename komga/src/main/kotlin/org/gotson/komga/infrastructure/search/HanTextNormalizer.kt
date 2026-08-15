package org.gotson.komga.infrastructure.search

import com.ibm.icu.text.Transliterator

/**
 * Produces Simplified and Traditional Chinese query variants without changing indexed text.
 * This preserves tokenization for other languages that share Han characters, such as Japanese.
 */
object HanTextNormalizer {
  private val traditionalToSimplified = ThreadLocal.withInitial {
    Transliterator.getInstance("Traditional-Simplified")
  }
  private val simplifiedToTraditional = ThreadLocal.withInitial {
    Transliterator.getInstance("Simplified-Traditional")
  }

  fun searchVariants(searchTerm: String): Set<String> =
    setOf(
      searchTerm,
      traditionalToSimplified.get().transliterate(searchTerm),
      simplifiedToTraditional.get().transliterate(searchTerm),
    )
}
