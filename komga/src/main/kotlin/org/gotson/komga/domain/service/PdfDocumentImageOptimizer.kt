package org.gotson.komga.domain.service

import java.awt.image.BufferedImage
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

object PdfDocumentImageOptimizer {

  /**
   * Mainstream document background and noise optimization.
   *
   * Addresses background artifacts common in scanned documents and books:
   * 1. Bleed-through / show-through (背透 / 背面反向透字)
   * 2. Uneven paper lighting and scanner shadow (光照不均 / 纸张底色泛黄)
   * 3. Salt-and-pepper noise and background speckles (孤立黑色杂点 / 噪点)
   *
   * Preserves foreground text and colored illustrations while restoring paper background to uniform clean white.
   */
  fun optimizeBackground(
    image: BufferedImage,
    mode: String = "normalize",
    targetDark: Boolean = false,
  ): BufferedImage {
    if (mode == "none" || image.width <= 0 || image.height <= 0) return image

    val width = image.width
    val height = image.height
    val srcRgb = IntArray(width * height)
    image.getRGB(0, 0, width, height, srcRgb, 0, width)
    val destRgb = IntArray(width * height)

    val isClean = mode == "clean"
    val targetBgRgb = if (targetDark) 0xFF000000.toInt() else 0xFFFFFFFF.toInt()

    if (isClean) {
      // Clean mode: calculate overall background luma & threshold for aggressive bleaching
      var lumaSum = 0.0
      var count = 0
      val step = max(1, min(width, height) / 200)
      for (y in 0 until height step step) {
        val rowOffset = y * width
        for (x in 0 until width step step) {
          val rgb = srcRgb[rowOffset + x]
          val r = (rgb shr 16) and 0xFF
          val g = (rgb shr 8) and 0xFF
          val b = rgb and 0xFF
          lumaSum += 0.299 * r + 0.587 * g + 0.114 * b
          count++
        }
      }
      val avgLuma = if (count > 0) lumaSum / count else 255.0
      val isDark = avgLuma < 128.0
      val tolerance = 38.0
      val bgThreshold = if (isDark) avgLuma + tolerance else avgLuma - tolerance

      for (i in 0 until (width * height)) {
        val rgb = srcRgb[i]
        val r = (rgb shr 16) and 0xFF
        val g = (rgb shr 8) and 0xFF
        val b = rgb and 0xFF
        val luma = 0.299 * r + 0.587 * g + 0.114 * b
        val isBg = if (isDark) luma <= bgThreshold else luma >= bgThreshold
        if (isBg) {
          destRgb[i] = targetBgRgb
        } else if (targetDark) {
          val inv = clamp((255.0 - luma).roundToInt(), 0, 255)
          destRgb[i] = (0xFF shl 24) or (inv shl 16) or (inv shl 8) or inv
        } else {
          val norm = clamp((luma * (255.0 / max(1.0, bgThreshold))).roundToInt(), 0, 255)
          destRgb[i] = (0xFF shl 24) or (norm shl 16) or (norm shl 8) or norm
        }
      }
    } else {
      // Mainstream adaptive background normalization (normalize / adaptive mode)
      val blockSize = max(16, min(48, (min(width, height) / 80.0).roundToInt()))
      val gridW = max(1, ceil(width / blockSize.toDouble()).toInt())
      val gridH = max(1, ceil(height / blockSize.toDouble()).toInt())
      val bgGrid = FloatArray(gridW * gridH)

      for (gy in 0 until gridH) {
        for (gx in 0 until gridW) {
          val startX = gx * blockSize
          val startY = gy * blockSize
          val endX = min(width, startX + blockSize)
          val endY = min(height, startY + blockSize)

          var maxLuma = 0.0
          var lumaSum = 0.0
          var count = 0
          for (y in startY until endY step 2) {
            val rowOffset = y * width
            for (x in startX until endX step 2) {
              val rgb = srcRgb[rowOffset + x]
              val r = (rgb shr 16) and 0xFF
              val g = (rgb shr 8) and 0xFF
              val b = rgb and 0xFF
              val luma = 0.299 * r + 0.587 * g + 0.114 * b
              if (luma > maxLuma) maxLuma = luma
              lumaSum += luma
              count++
            }
          }
          val blockAvg = if (count > 0) lumaSum / count else 255.0
          val blockEstimate = if (maxLuma > 0) (maxLuma * 0.75 + blockAvg * 0.25).toFloat() else 255f
          bgGrid[gy * gridW + gx] = max(40f, blockEstimate)
        }
      }

      for (y in 0 until height) {
        val gyExact = (y / blockSize.toDouble()) - 0.5
        val gy0 = max(0, min(gridH - 1, floor(gyExact).toInt()))
        val gy1 = max(0, min(gridH - 1, gy0 + 1))
        val yFrac = max(0.0, min(1.0, gyExact - gy0)).toFloat()
        val rowOffset = y * width

        for (x in 0 until width) {
          val gxExact = (x / blockSize.toDouble()) - 0.5
          val gx0 = max(0, min(gridW - 1, floor(gxExact).toInt()))
          val gx1 = max(0, min(gridW - 1, gx0 + 1))
          val xFrac = max(0.0, min(1.0, gxExact - gx0)).toFloat()

          val bg00 = bgGrid[gy0 * gridW + gx0]
          val bg10 = bgGrid[gy0 * gridW + gx1]
          val bg01 = bgGrid[gy1 * gridW + gx0]
          val bg11 = bgGrid[gy1 * gridW + gx1]

          val top = bg00 + (bg10 - bg00) * xFrac
          val bottom = bg01 + (bg11 - bg01) * xFrac
          val localBg = top + (bottom - top) * yFrac

          val idx = rowOffset + x
          val rgb = srcRgb[idx]
          val r = (rgb shr 16) and 0xFF
          val g = (rgb shr 8) and 0xFF
          val b = rgb and 0xFF
          val luma = 0.299 * r + 0.587 * g + 0.114 * b

          // Bleed-through suppression:
          // In scanned books, faint reverse-side text has luma close to local paper background (< 36 delta)
          val delta = localBg - luma
          if (delta < 36.0) {
            destRgb[idx] = targetBgRgb
            continue
          }

          val gain = 255.0f / max(1f, localBg)
          val normLuma = clamp((luma * gain).roundToInt(), 0, 255)
          if (normLuma >= 225) {
            destRgb[idx] = targetBgRgb
            continue
          }

          if (targetDark) {
            val inv = clamp(255 - normLuma, 0, 255)
            destRgb[idx] = (0xFF shl 24) or (inv shl 16) or (inv shl 8) or inv
          } else {
            val maxC = max(r, max(g, b))
            val minC = min(r, min(g, b))
            val isColor = (maxC - minC) >= 20

            if (isColor) {
              val nr = clamp((r * gain).roundToInt(), 0, 255)
              val ng = clamp((g * gain).roundToInt(), 0, 255)
              val nb = clamp((b * gain).roundToInt(), 0, 255)
              destRgb[idx] = (0xFF shl 24) or (nr shl 16) or (ng shl 8) or nb
            } else {
              // Contrast stretch on foreground monochrome text: map [0, 200] to [0, 255]
              val stretched = clamp((normLuma * (255.0 / 200.0)).roundToInt(), 0, 255)
              destRgb[idx] = (0xFF shl 24) or (stretched shl 16) or (stretched shl 8) or stretched
            }
          }
        }
      }
    }

    // Mainstream despeckling filter: eliminate isolated 1-2 pixel noise / black speckles in background
    if (width > 2 && height > 2) {
      val despeckledRgb = destRgb.clone()
      val bgCheck = if (targetDark) 20 else 240

      for (y in 1 until height - 1) {
        val rowOffset = y * width
        for (x in 1 until width - 1) {
          val idx = rowOffset + x
          val rgb = destRgb[idx]
          val r = (rgb shr 16) and 0xFF
          val g = (rgb shr 8) and 0xFF
          val b = rgb and 0xFF
          val luma = (0.299 * r + 0.587 * g + 0.114 * b).toInt()

          val isForeground = if (targetDark) luma > 50 else luma < 200
          if (!isForeground) continue

          var bgNeighborCount = 0
          for (dy in -1..1) {
            val nRow = (y + dy) * width
            for (dx in -1..1) {
              if (dy == 0 && dx == 0) continue
              val nRgb = destRgb[nRow + (x + dx)]
              val nr = (nRgb shr 16) and 0xFF
              val ng = (nRgb shr 8) and 0xFF
              val nb = nRgb and 0xFF
              val nLuma = (0.299 * nr + 0.587 * ng + 0.114 * nb).toInt()
              val isBgNeighbor = if (targetDark) nLuma <= bgCheck else nLuma >= bgCheck
              if (isBgNeighbor) bgNeighborCount++
            }
          }

          // If at least 7 of 8 neighbors are background, it's isolated noise speckle
          if (bgNeighborCount >= 7) {
            despeckledRgb[idx] = targetBgRgb
          }
        }
      }
      System.arraycopy(despeckledRgb, 0, destRgb, 0, width * height)
    }

    val output = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
    output.setRGB(0, 0, width, height, destRgb, 0, width)
    return output
  }

  private fun clamp(value: Int, minimum: Int, maximum: Int): Int =
    max(minimum, min(maximum, value))
}
