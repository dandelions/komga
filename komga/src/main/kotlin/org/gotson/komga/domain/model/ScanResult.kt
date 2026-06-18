package org.gotson.komga.domain.model

data class ScanResult(
  val series: Map<Series, List<Book>>,
  val sidecars: List<Sidecar>,
  val scannedBookCount: Int = series.values.sumOf { it.size },
  val countedBookCount: Int = scannedBookCount,
  val limited: Boolean = false,
)
