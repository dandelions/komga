package org.gotson.komga.interfaces.api.rest

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class BookControllerReflowTest {
  @Test
  fun `given page rotation when normalizing reflow rotation then quarter turns are preserved`() {
    assertThat(normalizePdfReflowRotation(-90)).isEqualTo(-90)
    assertThat(normalizePdfReflowRotation(90)).isEqualTo(90)
    assertThat(normalizePdfReflowRotation(180)).isEqualTo(180)
    assertThat(normalizePdfReflowRotation(270)).isEqualTo(-90)
    assertThat(normalizePdfReflowRotation(450)).isEqualTo(90)
  }

  @Test
  fun `given comma separated crop region when parsing reflow regions then region is preserved`() {
    val regions = parsePdfReflowRegionParameters(listOf("10,20,30,40"))

    assertThat(regions).hasSize(1)
    assertThat(regions.first().x).isEqualTo(10)
    assertThat(regions.first().y).isEqualTo(20)
    assertThat(regions.first().w).isEqualTo(30)
    assertThat(regions.first().h).isEqualTo(40)
  }

  @Test
  fun `given split crop region values when parsing reflow regions then region is preserved`() {
    val regions = parsePdfReflowRegionParameters(listOf("10", "20", "30", "40", "50", "60", "70", "80"))

    assertThat(regions).hasSize(2)
    assertThat(regions[0].x).isEqualTo(10)
    assertThat(regions[0].y).isEqualTo(20)
    assertThat(regions[0].w).isEqualTo(30)
    assertThat(regions[0].h).isEqualTo(40)
    assertThat(regions[1].x).isEqualTo(50)
    assertThat(regions[1].y).isEqualTo(60)
    assertThat(regions[1].w).isEqualTo(70)
    assertThat(regions[1].h).isEqualTo(80)
  }
}
