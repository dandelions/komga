<template>
  <v-container
    class="ma-0 pa-0 full-height reader-shell"
    :class="{'reader-night-mode': nightDisplay, 'reader-landscape-shell': landscapeDisplay && !continuousReader}"
    fluid
    v-if="pages.length > 0"
    :style="`width: 100%; background-color: ${backgroundColor}`"
  >
    <div>
      <v-slide-y-transition>
        <!-- Top Toolbar-->
        <v-toolbar
          dense elevation="1"
          v-if="showToolbars"
          class="settings full-width"
          style="position: fixed; top: 0"
        >
          <v-btn
            icon
            @click="closeBook"
          >
            <v-icon>mdi-arrow-left</v-icon>
          </v-btn>
          <v-toolbar-title class="reader-toolbar-title text-truncate">{{ bookTitle }}</v-toolbar-title>
          <v-spacer></v-spacer>

          <v-tooltip bottom v-if="incognito">
            <template v-slot:activator="{ on }">
              <v-icon v-on="on">mdi-incognito</v-icon>
            </template>
            <span>{{ $t('bookreader.tooltip_incognito') }}</span>
          </v-tooltip>

          <v-btn
            icon
            :disabled="!screenfull.isEnabled"
            @click="screenfull.isFullscreen ? screenfull.exit() : enterFullscreen()">
            <v-icon>{{ fullscreenIcon }}</v-icon>
          </v-btn>

          <v-btn
            icon
            :title="nightDisplay ? $t('theme.light').toString() : $t('theme.dark').toString()"
            @click="toggleNightDisplay"
          >
            <v-icon>{{ nightDisplay ? 'mdi-white-balance-sunny' : 'mdi-weather-night' }}</v-icon>
          </v-btn>

          <v-btn
            v-if="isPdf && $vuetify.breakpoint.mdAndUp"
            icon
            :disabled="continuousReader"
            :title="landscapeDisplay ? 'Portrait' : 'Landscape'"
            @click="toggleLandscapeDisplay"
          >
            <v-icon>{{ landscapeDisplay ? 'mdi-phone-rotate-portrait' : 'mdi-phone-rotate-landscape' }}</v-icon>
          </v-btn>

          <v-btn
            v-if="isPdf && $vuetify.breakpoint.mdAndUp"
            icon
            :disabled="continuousReader"
            title="Reflow"
            @click="toggleReflowMode"
          >
            <v-icon>{{ reflowMode || reflowSetupMode ? 'mdi-file-document' : 'mdi-file-document-outline' }}</v-icon>
          </v-btn>

          <v-btn
            v-if="$vuetify.breakpoint.mdAndUp"
            icon
            @click="showHelp = !showHelp">
            <v-icon>mdi-help-circle</v-icon>
          </v-btn>

          <v-btn
            v-if="$vuetify.breakpoint.mdAndUp"
            icon
            @click="showExplorer = !showExplorer"
          >
            <v-icon>mdi-view-grid</v-icon>
          </v-btn>
          <v-btn
            v-if="isPdf && $vuetify.breakpoint.mdAndUp"
            icon
            :title="$t('browse_book.pdf_toc')"
            :disabled="pdfTocLoading"
            @click="togglePdfToc"
          >
            <v-icon>mdi-table-of-contents</v-icon>
          </v-btn>
          <v-btn
            v-if="$vuetify.breakpoint.mdAndUp"
            icon
            @click="showSettings = !showSettings"
          >
            <v-icon>mdi-cog</v-icon>
          </v-btn>

          <v-menu offset-y>
            <template v-slot:activator="{ on }">
              <v-btn icon v-on="on" @click.prevent="">
                <v-icon>mdi-dots-vertical</v-icon>
              </v-btn>
            </template>
            <v-list>
              <template v-if="$vuetify.breakpoint.smAndDown">
                <v-list-item :disabled="continuousReader" @click="toggleLandscapeDisplay">
                  <v-list-item-icon>
                    <v-icon>{{ landscapeDisplay ? 'mdi-phone-rotate-portrait' : 'mdi-phone-rotate-landscape' }}</v-icon>
                  </v-list-item-icon>
                  <v-list-item-title>{{ landscapeDisplay ? 'Portrait' : 'Landscape' }}</v-list-item-title>
                </v-list-item>
                <v-list-item v-if="isPdf" :disabled="continuousReader" @click="toggleReflowMode">
                  <v-list-item-icon>
                    <v-icon>{{ reflowMode || reflowSetupMode ? 'mdi-file-document' : 'mdi-file-document-outline' }}</v-icon>
                  </v-list-item-icon>
                  <v-list-item-title>Reflow</v-list-item-title>
                </v-list-item>
                <v-list-item @click="showHelp = !showHelp">
                  <v-list-item-icon>
                    <v-icon>mdi-help-circle</v-icon>
                  </v-list-item-icon>
                  <v-list-item-title>{{ $t('bookreader.help') }}</v-list-item-title>
                </v-list-item>
                <v-list-item @click="showExplorer = !showExplorer">
                  <v-list-item-icon>
                    <v-icon>mdi-view-grid</v-icon>
                  </v-list-item-icon>
                  <v-list-item-title>{{ $t('common.pages') }}</v-list-item-title>
                </v-list-item>
                <v-list-item v-if="isPdf" :disabled="pdfTocLoading" @click="togglePdfToc">
                  <v-list-item-icon>
                    <v-icon>mdi-table-of-contents</v-icon>
                  </v-list-item-icon>
                  <v-list-item-title>{{ $t('browse_book.pdf_toc') }}</v-list-item-title>
                </v-list-item>
                <v-list-item @click="showSettings = !showSettings">
                  <v-list-item-icon>
                    <v-icon>mdi-cog</v-icon>
                  </v-list-item-icon>
                  <v-list-item-title>{{ $t('bookreader.reader_settings') }}</v-list-item-title>
                </v-list-item>
                <v-divider/>
              </template>
              <v-list-item @click="downloadCurrentPage">
                <v-list-item-title>{{ $t('bookreader.download_current_page') }}</v-list-item-title>
              </v-list-item>
              <v-list-item @click="setCurrentPageAsPoster(ItemTypes.BOOK)">
                <v-list-item-title>{{ $t('bookreader.set_current_page_as_book_poster') }}</v-list-item-title>
              </v-list-item>
              <v-list-item v-if="!book.oneshot" @click="setCurrentPageAsPoster(ItemTypes.SERIES)">
                <v-list-item-title>{{ $t('bookreader.set_current_page_as_series_poster') }}</v-list-item-title>
              </v-list-item>
              <v-list-item v-if="contextReadList" @click="setCurrentPageAsPoster(ItemTypes.READLIST)">
                <v-list-item-title>{{ $t('bookreader.set_current_page_as_readlist_poster') }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
        </v-toolbar>
      </v-slide-y-transition>

      <v-slide-y-reverse-transition>
        <!-- Bottom Toolbar-->
        <v-toolbar
          dense
          elevation="1"
          class="settings full-width"
          style="position: fixed; bottom: 0"
          horizontal
          v-if="showToolbars"
        >
          <v-row justify="center">
            <!--  Menu: page slider  -->
            <v-col class="px-0">
              <v-slider
                hide-details
                thumb-label
                @change="goTo"
                v-model="goToPage"
                class="align-center"
                min="1"
                :max="pagesCount"
              >
                <template v-slot:prepend>
                  <v-icon @click="previousBook" class="">mdi-undo</v-icon>
                  <v-icon @click="goToFirst" class="mx-2">mdi-skip-previous</v-icon>
                  <v-label>
                    {{ page }}
                  </v-label>
                </template>
                <template v-slot:append>
                  <v-label>
                    {{ pagesCount }}
                  </v-label>
                  <v-icon @click="goToLast" class="mx-1">mdi-skip-next</v-icon>
                  <v-icon @click="nextBook" class="">mdi-redo</v-icon>
                </template>
              </v-slider>
            </v-col>
          </v-row>

        </v-toolbar>
      </v-slide-y-reverse-transition>
    </div>

    <div
      class="full-height reader-frame"
      :class="{'reader-frame-landscape': landscapeDisplay && !continuousReader}"
    >
      <div
        v-if="isPdf && k2ReflowMode && !continuousReader"
        class="reflow-reader"
        v-touch="reflowTouchHandlers"
      >
        <k2-reflowed-page
          ref="k2ReflowedPage"
          :page="currentPage"
          :target-width="reflowTargetWidth"
          :rotation="readerRotation"
          :start-at-end="k2ReflowStartAtEnd"
          :crop-rois-by-parity="reflowSettings.cropRoisByParity"
          :settings="reflowSettings.k2Settings"
          :night-display="nightDisplay"
          @exit-k2-reflow="exitK2ReflowMode"
          @source-previous="k2SourcePreviousPage"
          @source-next="k2SourceNextPage"
          @crop-mode-change="setReflowCropMode"
          @crop-rois-change="setReflowCropRois"
          @settings-change="setK2ReflowSettings"
          @rotation-change="setReaderRotation"
          @show-pdf-toc="openPdfToc"
          @toggle-night-display="toggleNightDisplay"
          @back-to-book="closeBook"
        />

        <div
          v-if="!reflowCropMode"
          @click="k2PreviousPage"
          class="reflow-click-left"
        />
        <div
          v-if="!reflowCropMode"
          @click="k2NextPage"
          class="reflow-click-right"
        />
        <div
          v-if="!reflowCropMode"
          @click="toggleToolbars()"
          class="reflow-click-center"
        />
      </div>

      <div
        v-else-if="isPdf && (reflowMode || reflowSetupMode) && !continuousReader"
        class="reflow-reader"
        v-touch="reflowTouchHandlers"
      >
        <reflowed-page
          ref="reflowedPage"
          :page="currentPage"
          :target-width="reflowTargetWidth"
          :rotation="readerRotation"
          :options="reflowOptions"
          :cached-items="cachedReflowItems(currentPage)"
          :cached-page-background="cachedReflowBackground(currentPage)"
          :cached-transfer-stats="cachedReflowTransferStats(currentPage)"
          :cache-key="reflowCacheKey"
          :night-display="nightDisplay"
          :server-reflow="reflowSettings.processingMode === 'server'"
          :server-reflow-url="reflowPageUrl(currentPage)"
          :start-at-end="reflowStartAtEnd"
          :defer-reflow="reflowSetupMode"
          @text-scale-change="setReflowTextScale"
          @processing-mode-change="setReflowProcessingMode"
          @column-count-change="setReflowColumnCount"
          @skew-correction-change="setReflowSkewCorrection"
          @vertical-text-change="setReflowVerticalText"
          @vertical-direction-change="setReflowVerticalDirection"
          @stroke-strength-change="setReflowStrokeStrength"
          @contrast-enhancement-change="setReflowContrastEnhancement"
          @match-background-change="setReflowMatchBackground"
          @block-spacing-change="setReflowBlockSpacing"
          @rotation-change="setReaderRotation"
          @crop-mode-change="setReflowCropMode"
          @crop-rois-change="setReflowCropRois"
          @start-reflow="startReflowMode"
          @force-reflow="forceCurrentReflow"
          @exit-reflow="exitReflowMode"
          @reflowed="cacheReflowPage"
          @source-previous="reflowSourcePreviousPage"
          @source-next="reflowSourceNextPage"
          @show-pdf-toc="openPdfToc"
          @toggle-night-display="toggleNightDisplay"
          @back-to-book="closeBook"
        />
        <reflowed-page
          v-if="reflowMode && prefetchReflowPage"
          class="reflow-prefetch"
          :page="prefetchReflowPage"
          :target-width="reflowTargetWidth"
          :rotation="readerRotation"
          :options="reflowOptions"
          :cached-items="cachedReflowItems(prefetchReflowPage)"
          :cached-page-background="cachedReflowBackground(prefetchReflowPage)"
          :cached-transfer-stats="cachedReflowTransferStats(prefetchReflowPage)"
          :cache-key="reflowCacheKey"
          :night-display="nightDisplay"
          :server-reflow="reflowSettings.processingMode === 'server'"
          :server-reflow-url="reflowPageUrl(prefetchReflowPage)"
          preload
          @reflowed="cacheReflowPage"
        />

        <div
          v-if="reflowMode && !reflowCropMode"
          @click="reflowPreviousPage"
          class="reflow-click-left"
        />
        <div
          v-if="reflowMode && !reflowCropMode"
          @click="reflowNextPage"
          class="reflow-click-right"
        />
        <div
          v-if="reflowMode && !reflowCropMode"
          @click="toggleToolbars()"
          class="reflow-click-center"
        />
      </div>

      <continuous-reader
        v-else-if="continuousReader"
        :key="`continuous-reader-${readerViewKey}`"
        :pages="pages"
        :page.sync="page"
          :animations="animations"
          :scale="continuousScale"
          :sidePadding="sidePadding"
          :page-margin="pageMargin"
          :image-filter="normalReaderImageFilter"
          :rotation="readerRotation"
          :skew-correction="readerSkewCorrection"
          :contrast-enhancement="readerContrastEnhancement"
          :crop-regions-by-parity="readerCropRegionsByParity"
          :page-display-urls="readerDeskewedPageUrls"
          :active-crop-region="readerActiveCropRegion"
        @menu="toggleToolbars()"
        @jump-previous="jumpToPrevious()"
        @jump-next="jumpToNext()"
      ></continuous-reader>

      <paged-reader
        v-else
        :key="`paged-reader-${readerViewKey}`"
        ref="pagedReader"
        :pages="pages"
        :page.sync="page"
        :reading-direction="readingDirection"
        :page-layout="pageLayout"
        :scale="scale"
        :animations="animations"
        :swipe="readerSwipeEnabled"
        :left-navigation-action="pagedLeftNavigationAction"
        :image-filter="normalReaderImageFilter"
        :rotation="readerRotation"
        :skew-correction="readerSkewCorrection"
        :contrast-enhancement="readerContrastEnhancement"
        :crop-regions-by-parity="readerCropRegionsByParity"
        :page-display-urls="readerDeskewedPageUrls"
        :active-crop-region="readerActiveCropRegion"
        @update:active-crop-region="setReaderActiveCropRegion"
        @menu="toggleToolbars()"
        @jump-previous="jumpToPrevious()"
        @jump-next="jumpToNext()"
      ></paged-reader>
    </div>

    <div v-if="readerCropMode" class="reader-crop-panel" @click.stop>
      <div class="reader-crop-toolbar">
        <v-btn small @click="cancelReaderCropMode">取消</v-btn>
        <v-btn small color="primary" :disabled="!readerCropCanComplete" @click="completeReaderCropMode">完成</v-btn>
        <span>拖拽选择阅读范围</span>
        <div class="reader-crop-skew-control">
          <span>手动纠斜</span>
          <v-btn icon small dark @click="adjustReaderCropSkewCorrection(-0.5)">
            <v-icon small>mdi-minus</v-icon>
          </v-btn>
          <input
            type="range"
            min="-10"
            max="10"
            step="0.5"
            :value="readerSkewCorrection"
            @input="setReaderCropSkewCorrection"
          />
          <v-btn icon small dark @click="adjustReaderCropSkewCorrection(0.5)">
            <v-icon small>mdi-plus</v-icon>
          </v-btn>
          <span>{{ readerSkewCorrectionLabel }}</span>
        </div>
      </div>
      <div
        class="reader-crop-stage"
        @pointerdown="startReaderCrop"
        @pointermove="moveReaderCrop"
        @pointerup="finishReaderCrop"
        @pointercancel="cancelReaderCropDraft"
      >
        <img
          ref="readerCropImage"
          :src="readerCropImageSrc"
          class="reader-crop-image"
          alt=""
          draggable="false"
        />
        <div
          v-if="readerCropActiveRect"
          class="reader-crop-rect"
          :style="readerCropActiveRect"
        />
      </div>
    </div>

    <thumbnail-explorer-dialog
      v-model="showExplorer"
      :bookId="bookId"
      @go="goTo"
      :pagesCount="pagesCount"
    ></thumbnail-explorer-dialog>

    <v-bottom-sheet
      v-model="showPdfToc"
      :close-on-content-click="false"
      max-width="500"
      @keydown.esc.stop=""
      scrollable
    >
      <v-card>
        <v-toolbar dark color="primary">
          <v-btn icon dark @click="showPdfToc = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
          <v-toolbar-title>{{ $t('browse_book.pdf_toc') }}</v-toolbar-title>
        </v-toolbar>

        <v-card-text class="pa-0">
          <v-progress-linear
            v-if="pdfTocLoading"
            indeterminate
            color="primary"
          />
          <toc-list
            v-else-if="pdfTocFlattened.length > 0"
            :toc="pdfTocFlattened"
            @goto="goToPdfTocEntry"
          />
          <v-alert
            v-else
            type="info"
            text
            dense
            class="ma-4"
          >
            {{ $t('$vuetify.noDataText') }}
          </v-alert>
        </v-card-text>
      </v-card>
    </v-bottom-sheet>

    <v-bottom-sheet
      v-model="showSettings"
      :close-on-content-click="false"
      max-width="500"
      @keydown.esc.stop=""
      scrollable
    >
      <v-card>
        <v-toolbar dark color="primary">
          <v-btn icon dark @click="showSettings = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
          <v-toolbar-title>{{ $t('bookreader.reader_settings') }}</v-toolbar-title>
        </v-toolbar>

        <v-card-text class="pa-0">
          <v-list class="full-height full-width">
            <v-subheader class="font-weight-black text-h6">{{ $t('bookreader.settings.general') }}</v-subheader>
            <v-list-item>
              <settings-select
                :items="readingDirs"
                v-model="readingDirection"
                :label="$t('bookreader.settings.reading_mode')"
              />
            </v-list-item>

            <v-list-item>
              <settings-switch v-model="animations"
                               :label="$t('bookreader.settings.animate_page_transitions')"/>
            </v-list-item>

            <v-list-item>
              <settings-switch v-model="swipe" :label="$t('bookreader.settings.gestures')"/>
            </v-list-item>

            <v-list-item>
              <settings-switch v-model="alwaysFullscreen" :label="$t('bookreader.settings.always_fullscreen')"
                               :disabled="!screenfull.isEnabled"/>
            </v-list-item>

            <v-subheader class="font-weight-black text-h6">{{ $t('bookreader.settings.display') }}</v-subheader>
            <v-list-item>
              <settings-select
                :items="backgroundColors"
                v-model="backgroundColor"
                :label="$t('bookreader.settings.background_color')"
              />
            </v-list-item>
            <v-list-item v-if="!activeReflowMode">
              <v-slider
                v-model="readerStrokeStrength"
                label="Stroke"
                min="0"
                max="3"
                step="0.1"
                thumb-label
              />
            </v-list-item>
            <v-list-item v-if="!activeReflowMode">
              <settings-switch v-model="readerContrastEnhancement" label="文字/背景增强"/>
            </v-list-item>
            <v-list-item v-if="isPdf">
              <div class="reader-rotation-setting">
                <span class="mr-2 text-caption">旋转</span>
                <v-btn small class="mr-1" :color="readerRotation === -90 ? 'primary' : undefined" @click="setReaderRotation(-90)">
                  -90°
                </v-btn>
                <v-btn small class="mr-1" :color="readerRotation === 0 ? 'primary' : undefined" @click="setReaderRotation(0)">
                  0°
                </v-btn>
                <v-btn small class="mr-1" :color="readerRotation === 90 ? 'primary' : undefined" @click="setReaderRotation(90)">
                  +90°
                </v-btn>
                <v-btn small :color="readerRotation === 180 ? 'primary' : undefined" @click="setReaderRotation(180)">
                  180°
                </v-btn>
              </div>
            </v-list-item>
            <v-list-item v-if="!activeReflowMode">
              <v-slider
                v-model="readerSkewCorrection"
                label="手动纠斜"
                min="-10"
                max="10"
                step="0.5"
                thumb-label
                suffix="°"
              >
                <template v-slot:prepend>
                  <v-btn icon small @click="adjustReaderSkewCorrection(-0.5)">
                    <v-icon small>mdi-minus</v-icon>
                  </v-btn>
                </template>
                <template v-slot:append>
                  <span class="mr-1 text-caption">{{ readerSkewCorrectionLabel }}</span>
                  <v-btn icon small @click="adjustReaderSkewCorrection(0.5)">
                    <v-icon small>mdi-plus</v-icon>
                  </v-btn>
                </template>
              </v-slider>
            </v-list-item>
            <v-list-item v-if="!activeReflowMode">
              <settings-switch v-model="readerCropEnabled" label="截取区域"/>
            </v-list-item>
            <v-list-item v-if="!activeReflowMode && readerCropEnabled">
              <span class="mr-2">{{ readerCropPageParityLabel }}</span>
              <v-btn small class="mr-1" :color="readerActiveCropRegion === 0 ? 'primary' : undefined" @click="setReaderActiveCropRegion(0)">区域 1</v-btn>
              <v-btn small class="mr-2" :color="readerActiveCropRegion === 1 ? 'primary' : undefined" @click="setReaderActiveCropRegion(1)">区域 2</v-btn>
              <v-btn small class="mr-2" @click="startReaderCropMode">设置截取区域</v-btn>
              <v-btn small text @click="clearReaderCropRegion">清除</v-btn>
            </v-list-item>

            <template v-if="continuousReader">
              <v-subheader class="font-weight-black text-h6">{{ $t('bookreader.settings.webtoon') }}</v-subheader>
              <v-list-item>
                <settings-select
                  :items="continuousScaleTypes"
                  v-model="continuousScale"
                  :label="$t('bookreader.settings.scale_type')"
                />
              </v-list-item>
              <v-list-item>
                <settings-select
                  :items="paddingPercentages"
                  v-model="sidePadding"
                  :label="$t('bookreader.settings.side_padding')"
                />
              </v-list-item>
              <v-list-item>
                <settings-select
                  :items="marginValues"
                  v-model="pageMargin"
                  :label="$t('bookreader.settings.page_margin')"
                />
              </v-list-item>
            </template>

            <template v-if="!continuousReader">
              <v-subheader class="font-weight-black text-h6">{{ $t('bookreader.settings.paged') }}</v-subheader>
              <v-list-item>
                <settings-select
                  :items="scaleTypes"
                  v-model="scale"
                  :label="$t('bookreader.settings.scale_type')"
                />
              </v-list-item>

              <v-list-item>
                <settings-select
                  :items="pageLayouts"
                  v-model="pageLayout"
                  :label="$t('bookreader.settings.page_layout')"
                />
              </v-list-item>

              <v-list-item v-if="!activeReflowMode">
                <settings-select
                  :items="pagedLeftNavigationActions"
                  v-model="pagedLeftNavigationAction"
                  label="左侧点击/左滑"
                />
              </v-list-item>

              <template v-if="isPdf">
                <v-subheader class="font-weight-black text-h6">Reflow</v-subheader>
                <v-list-item>
                  <settings-switch :value="reflowEnabled" label="Reflow page" @input="setReflowEnabled"/>
                </v-list-item>
              </template>
              <template v-if="isPdf && reflowEnabled">
                <v-list-item>
                  <settings-select
                    :items="reflowProcessingModes"
                    v-model="reflowSettings.processingMode"
                    label="重排位置"
                  />
                </v-list-item>
                <v-list-item>
                  <settings-switch v-model="reflowSettings.autoCropBorder" label="Auto crop borders"/>
                </v-list-item>
                <v-list-item>
                  <settings-switch v-model="reflowSettings.contrastEnhancement" label="文字/背景增强"/>
                </v-list-item>
                <v-list-item>
                  <settings-switch v-model="reflowSettings.matchBackground" label="背景跟随底色"/>
                </v-list-item>
                <v-list-item>
                  <settings-switch v-model="reflowSettings.verticalText" label="Vertical text"/>
                </v-list-item>
                <v-list-item v-if="reflowSettings.verticalText">
                  <settings-select
                    :items="reflowVerticalDirections"
                    v-model="reflowSettings.verticalDirection"
                    label="Vertical direction"
                  />
                </v-list-item>
                <v-list-item>
                  <settings-select
                    :items="reflowColumnCounts"
                    v-model="reflowSettings.columnCount"
                    label="Columns"
                  />
                </v-list-item>
                <v-list-item>
                  <v-slider
                    v-model="reflowSettings.textScale"
                    label="Text size"
                    min="10"
                    max="140"
                    thumb-label
                    suffix="%"
                  />
                </v-list-item>
                <v-list-item>
                  <v-slider
                    v-model="reflowSettings.strokeStrength"
                    label="Stroke"
                    min="0.1"
                    max="3"
                    step="0.1"
                    thumb-label
                  />
                </v-list-item>
                <v-list-item>
                  <v-slider
                    v-model="reflowSettings.blockSpacing"
                    label="Spacing"
                    min="0"
                    max="24"
                    step="1"
                    thumb-label
                    suffix="px"
                  />
                </v-list-item>
                <v-list-item>
                  <v-slider
                    v-model="reflowSettings.threshold"
                    label="Threshold"
                    min="50"
                    max="230"
                    thumb-label
                  />
                </v-list-item>
                <v-list-item>
                  <v-slider
                    v-model="reflowSettings.columnGap"
                    label="Col Gap"
                    min="5"
                    max="80"
                    thumb-label
                    suffix="px"
                  />
                </v-list-item>
                <v-list-item>
                  <v-slider
                    v-model="reflowSettings.wordGap"
                    label="Word Gap"
                    min="1"
                    max="30"
                    thumb-label
                    suffix="px"
                  />
                </v-list-item>
                <v-list-item>
                  <v-slider
                    v-model="reflowSettings.marginTop"
                    label="Top crop"
                    min="0"
                    max="45"
                    thumb-label
                    suffix="%"
                  />
                </v-list-item>
                <v-list-item>
                  <v-slider
                    v-model="reflowSettings.marginRight"
                    label="Right crop"
                    min="0"
                    max="45"
                    thumb-label
                    suffix="%"
                  />
                </v-list-item>
                <v-list-item>
                  <v-slider
                    v-model="reflowSettings.marginBottom"
                    label="Bottom crop"
                    min="0"
                    max="45"
                    thumb-label
                    suffix="%"
                  />
                </v-list-item>
                <v-list-item>
                  <v-slider
                    v-model="reflowSettings.marginLeft"
                    label="Left crop"
                    min="0"
                    max="45"
                    thumb-label
                    suffix="%"
                  />
                </v-list-item>
              </template>
            </template>


          </v-list>
        </v-card-text>
      </v-card>
    </v-bottom-sheet>
    <v-snackbar
      v-model="jumpToPreviousBook"
      :timeout="jumpConfirmationDelay"
      top
      color="rgba(0, 0, 0, 0.8)"
      multi-line
      class="mt-12"
    >
      <div class="body-1 pa-6">
        <p>{{ $t('bookreader.beginning_of_book') }}</p>
        <p v-if="!$_.isEmpty(siblingPrevious)">{{ $t('bookreader.move_previous') }}</p>
      </div>
    </v-snackbar>

    <v-snackbar
      v-model="jumpToNextBook"
      :timeout="jumpConfirmationDelay"
      top
      color="rgba(0, 0, 0, 0.8)"
      multi-line
      class="mt-12"
    >
      <div class="text-body-1 pa-6">
        <p>{{ $t('bookreader.end_of_book') }}</p>
        <p v-if="!$_.isEmpty(siblingNext)">{{ $t('bookreader.move_next') }}</p>
        <p v-else>{{ $t('bookreader.move_next_exit') }}</p>
      </div>
    </v-snackbar>

    <v-snackbar
      v-model="notificationReadingDirection.enabled"
      color="rgba(0, 0, 0, 0.8)"
      bottom
      timeout="3000"
    >
      <p class="text-body-1 text-center ma-0">
        {{
          readingDirectionText
        }}{{ notificationReadingDirection.fromMetadata ? '(' + $t('bookreader.from_series_metadata') + ')' : '' }}
      </p>
    </v-snackbar>

    <v-snackbar
      v-model="notification.enabled"
      color="rgba(0, 0, 0, 0.8)"
      centered
      :timeout="notification.timeout"
    >
      <p class="text-h6 text-center ma-0">
        {{ notification.message }}
      </p>
    </v-snackbar>

    <shortcut-help-dialog
      v-model="showHelp"
      :shortcuts="shortcutsHelp"
    />
  </v-container>
</template>

<script lang="ts">
import {debounce} from 'lodash'
import SettingsSelect from '@/components/SettingsSelect.vue'
import SettingsSwitch from '@/components/SettingsSwitch.vue'
import ThumbnailExplorerDialog from '@/components/dialogs/ThumbnailExplorerDialog.vue'
import ShortcutHelpDialog from '@/components/dialogs/ShortcutHelpDialog.vue'
import {getBookTitleCompact} from '@/functions/book-title'
import {checkImageSupport, ImageFeature} from '@/functions/check-image'
import {bookPageReflowUrl, bookPageUrl} from '@/functions/urls'
import {getFileFromUrl} from '@/functions/file'
import {resizeImageFile} from '@/functions/resize-image'
import {ReadingDirection} from '@/types/enum-books'
import Vue from 'vue'
import {Location} from 'vue-router'
import PagedReader from '@/components/readers/PagedReader.vue'
import ContinuousReader from '@/components/readers/ContinuousReader.vue'
import ReflowedPage from '@/components/readers/ReflowedPage.vue'
import K2ReflowedPage from '@/components/readers/K2ReflowedPage.vue'
import TocList from '@/components/TocList.vue'
import {ContinuousScaleType, MarginValues, PaddingPercentage, PagedNavigationAction, PagedReaderLayout, ScaleType} from '@/types/enum-reader'
import {
  shortcutsLTR,
  shortcutsRTL,
  shortcutsSettingsPaged,
  shortcutsVertical,
} from '@/functions/shortcuts/paged-reader'
import {shortcutsMenus, shortcutsSettings} from '@/functions/shortcuts/bookreader'
import {shortcutsAll} from '@/functions/shortcuts/reader'
import {shortcutsSettingsContinuous} from '@/functions/shortcuts/continuous-reader'
import {BookDto, PageDto, PageDtoWithUrl} from '@/types/komga-books'
import {Context, ContextOrigin} from '@/types/context'
import {SeriesDto} from '@/types/komga-series'
import jsFileDownloader from 'js-file-downloader'
import screenfull from 'screenfull'
import {ItemTypes} from '@/types/items'
import {getBookReadRouteFromMedia} from '@/functions/book-format'
import {TocEntry} from '@/types/epub'
import {flattenToc} from '@/functions/toc'
import {CLIENT_SETTING, ClientSettingUserUpdateDto} from '@/types/komga-clientsettings'

const REFLOW_SETTINGS_STORAGE_PREFIX = 'komga.pdfReflowSettings.'
const READER_IMAGE_SETTINGS_STORAGE_PREFIX = 'komga.readerImageSettings.'
const REFLOW_CACHE_RADIUS = 4
const REFLOW_PREFETCH_DELAY_MS = 800

function defaultCropRegionsByParity(enabled: boolean = false): any {
  return {
    enabled,
    odd: null,
    even: null,
    regions: {
      odd: [null, null],
      even: [null, null],
    },
    explicit: {
      odd: false,
      even: false,
    },
    explicitRegions: {
      odd: [false, false],
      even: [false, false],
    },
  }
}

function defaultReflowSettings(): any {
  return {
    processingMode: 'local',
    autoCropBorder: true,
    textScale: 40,
    columnCount: 1,
    skewCorrection: 0,
    threshold: 185,
    columnGap: 15,
    wordGap: 3,
    strokeStrength: 0.1,
    contrastEnhancement: false,
    matchBackground: false,
    blockSpacing: 6,
    verticalText: false,
    verticalDirection: 'rtl',
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    cropRoisByParity: defaultCropRegionsByParity(false),
    k2Settings: {
      textScale: 80,
      maxColumns: 2,
      threshold: 185,
      strokeStrength: 0.8,
      contrastEnhancement: false,
      matchBackground: false,
      wordGap: 3,
      outputPadding: 16,
    },
  }
}

function defaultReaderImageSettings(): any {
  return {
    strokeStrength: 0,
    rotation: 0,
    skewCorrection: 0,
    contrastEnhancement: false,
    cropRegionsByParity: defaultCropRegionsByParity(false),
  }
}

export default Vue.extend({
  name: 'DivinaReader',
  components: {
    ContinuousReader,
    PagedReader,
    ReflowedPage,
    K2ReflowedPage,
    TocList,
    SettingsSwitch,
    SettingsSelect,
    ThumbnailExplorerDialog,
    ShortcutHelpDialog,
  },
  data: function () {
    return {
      ItemTypes,
      screenfull,
      fullscreenIcon: 'mdi-fullscreen',
      book: {} as BookDto,
      series: {} as SeriesDto,
      context: {} as Context,
      contextName: '',
      incognito: false,
      siblingPrevious: {} as BookDto,
      siblingNext: {} as BookDto,
      jumpToNextBook: false,
      jumpToPreviousBook: false,
      jumpConfirmationDelay: 3000,
      notificationReadingDirection: {
        enabled: false,
        fromMetadata: false,
      },
      pages: [] as PageDtoWithUrl[],
      page: undefined as unknown as number,
      supportedMediaTypes: ['image/jpeg', 'image/png', 'image/gif'],
      convertTo: 'jpeg',
      showExplorer: false,
      showPdfToc: false,
      pdfTocLoading: false,
      pdfTocLoaded: false,
      pdfToc: [] as TocEntry[],
      showToolbars: false,
      showSettings: false,
      showHelp: false,
      landscapeDisplay: false,
      reflowSetupMode: false,
      reflowMode: false,
      k2ReflowMode: false,
      reflowStartAtEnd: false,
      k2ReflowStartAtEnd: false,
      reflowCropMode: false,
      reflowSettingsBookId: '',
      loadingReflowSettings: false,
      saveReflowSettingsServerDebounced: undefined as undefined | ((bookId?: string, settings?: Record<string, any>) => void),
      readerImageSettingsBookId: '',
      loadingReaderImageSettings: false,
      saveReaderImageSettingsServerDebounced: undefined as undefined | ((bookId?: string, settings?: Record<string, any>) => void),
      reflowCache: {} as Record<string, any>,
      reflowPrefetchPage: 0,
      reflowPrefetchTimer: undefined as number | undefined,
      reflowPrefetchIdleHandle: undefined as number | undefined,
      reflowSettings: defaultReflowSettings(),
      goToPage: 1,
      settings: {
        pageLayout: PagedReaderLayout.SINGLE_PAGE,
        leftNavigationAction: PagedNavigationAction.PREVIOUS,
        swipe: true,
        alwaysFullscreen: false,
        animations: true,
        scale: ScaleType.SCREEN,
        continuousScale: ContinuousScaleType.WIDTH,
        sidePadding: 0,
        pageMargin: 0,
        readingDirection: ReadingDirection.LEFT_TO_RIGHT,
        backgroundColor: 'black',
        strokeStrength: 0,
        rotation: 0,
        skewCorrection: 0,
        contrastEnhancement: false,
        cropRegionsByParity: defaultCropRegionsByParity(false),
      },
      readerCropMode: false,
      readerCropDrawing: false,
      readerActiveCropRegion: 0,
      readerCropStart: {x: 0, y: 0},
      readerCropDraft: undefined as undefined | {x: number, y: number, w: number, h: number},
      readerCropImageUrl: '',
      readerCropImageRequestId: 0,
      readerDeskewedPageUrls: {} as Record<number, string>,
      readerViewKey: 0,
      shortcuts: {} as any,
      notification: {
        enabled: false,
        message: '',
        timeout: 4000,
      },
      readingDirs: Object.values(ReadingDirection).map(x => ({
        text: this.$i18n.t(`enums.reading_direction.${x}`),
        value: x,
      })),
      scaleTypes: Object.values(ScaleType).map(x => ({
        text: this.$i18n.t(x),
        value: x,
      })),
      continuousScaleTypes: Object.values(ContinuousScaleType).map(x => ({
        text: this.$i18n.t(x),
        value: x,
      })),
      pageLayouts: Object.values(PagedReaderLayout).map(x => ({
        text: this.$i18n.t(x),
        value: x,
      })),
      pagedLeftNavigationActions: [
        {text: '上一页', value: PagedNavigationAction.PREVIOUS},
        {text: '下一页', value: PagedNavigationAction.NEXT},
      ],
      reflowColumnCounts: [
        {text: '1', value: 1},
        {text: '2', value: 2},
        {text: '3', value: 3},
        {text: '4', value: 4},
      ],
      reflowVerticalDirections: [
        {text: 'Right to left', value: 'rtl'},
        {text: 'Left to right', value: 'ltr'},
      ],
      reflowProcessingModes: [
        {text: '本地重排', value: 'local'},
        {text: '服务端重排', value: 'server'},
      ],
      paddingPercentages: Object.values(PaddingPercentage).map(x => ({
        text: x === 0 ? this.$i18n.t('bookreader.settings.side_padding_none').toString() : `${x}%`,
        value: x,
      })),
      marginValues: Object.values(MarginValues).map(x => ({
        text: x === 0 ? this.$i18n.t('bookreader.settings.side_padding_none').toString() : `${x}px`,
        value: x,
      })),
      backgroundColors: [
        {text: this.$t('bookreader.settings.background_colors.white').toString(), value: 'white'},
        {text: this.$t('bookreader.settings.background_colors.gray').toString(), value: '#212121'},
        {text: this.$t('bookreader.settings.background_colors.black').toString(), value: 'black'},
      ],
    }
  },
  created() {
    this.$vuetify.rtl = false
    checkImageSupport(ImageFeature.WEBP_LOSSY, (isSupported) => {
      if (isSupported) this.supportedMediaTypes.push('image/webp')
    })
    checkImageSupport(ImageFeature.JPEG_XL, (isSupported) => {
      if (isSupported) this.supportedMediaTypes.push('image/jxl')
    })
    checkImageSupport(ImageFeature.AVIF, (isSupported) => {
      if (isSupported) this.supportedMediaTypes.push('image/avif')
    })
    this.shortcuts = this.$_.keyBy([...shortcutsSettings, ...shortcutsSettingsPaged, ...shortcutsSettingsContinuous, ...shortcutsMenus, ...shortcutsAll], x => x.key)
    this.saveReflowSettingsServerDebounced = debounce((bookId?: string, settings?: Record<string, any>) => this.saveReflowSettingsServer(bookId, settings), 700)
    this.saveReaderImageSettingsServerDebounced = debounce((bookId?: string, settings?: Record<string, any>) => this.saveReaderImageSettingsServer(bookId, settings), 700)
    window.addEventListener('keydown', this.keyPressed)
    if (screenfull.isEnabled) screenfull.on('change', this.fullscreenChanged)
  },
  async mounted() {
    document.documentElement.classList.add('html-reader')

    this.$debug('[mounted]', 'route.query:', this.$route.query)

    this.readingDirection = this.$store.state.persistedState.webreader.readingDirection
    this.animations = this.$store.state.persistedState.webreader.animations
    this.pageLayout = this.$store.state.persistedState.webreader.paged.pageLayout
    this.pagedLeftNavigationAction = this.$store.state.persistedState.webreader.paged.leftNavigationAction
    this.swipe = this.$store.state.persistedState.webreader.swipe
    this.alwaysFullscreen = this.$store.state.persistedState.webreader.alwaysFullscreen
    this.scale = this.$store.state.persistedState.webreader.paged.scale
    this.continuousScale = this.$store.state.persistedState.webreader.continuous.scale
    this.sidePadding = this.$store.state.persistedState.webreader.continuous.padding
    this.pageMargin = this.$store.state.persistedState.webreader.continuous.margin
    this.backgroundColor = this.$store.state.persistedState.webreader.background
    this.readerImageSettingsBookId = this.bookId
    this.loadReaderImageSettings(this.bookId)
    this.reflowSettingsBookId = this.bookId
    this.loadReflowSettings(this.bookId)

    this.setup(this.bookId, Number(this.$route.query.page))
  },
  destroyed() {
    document.documentElement.classList.remove('html-reader')
    this.clearReflowPrefetch()
    this.revokeReaderCropImageUrl()
    this.revokeReaderDeskewedPageUrls()

    this.unlockOrientation()
    this.$vuetify.rtl = (this.$t('common.locale_rtl') === 'true')
    window.removeEventListener('keydown', this.keyPressed)
    if (screenfull.isEnabled) {
      screenfull.off('change', this.fullscreenChanged)
      screenfull.exit()
    }
  },
  props: {
    bookId: {
      type: String,
      required: true,
    },
  },
  async beforeRouteUpdate(to, from, next) {
    if (to.params.bookId !== from.params.bookId) {
      // route update means either:
      // - going to previous/next book, in this case the query.page is not set, so it will default to first page
      // - pressing the back button of the browser and navigating to the previous book, in this case the query.page is set, so we honor it
      this.$debug('[beforeRouteUpdate]', 'to.query:', to.query)
      this.readerImageSettingsBookId = to.params.bookId
      this.loadReaderImageSettings(to.params.bookId)
      this.reflowSettingsBookId = to.params.bookId
      this.loadReflowSettings(to.params.bookId)
      this.setup(to.params.bookId, Number(to.query.page))
    }
    next()
  },
  watch: {
    page: {
      handler(val, old) {
        if (val) {
          this.markProgress(val)
          this.goToPage = val
          this.updateRoute()
          this.clearReflowPrefetch()
          this.$nextTick(() => {
            if (this.reflowMode && this.cachedReflowItems(this.currentPage)) this.scheduleNextReflowPrefetch()
          })
        }
      },
      immediate: true,
    },
    reflowCacheKey() {
      this.clearReflowPrefetch()
    },
    reflowSettings: {
      handler() {
        if (!this.loadingReflowSettings) this.saveReflowSettings()
      },
      deep: true,
    },
  },
  computed: {
    continuousReader(): boolean {
      return this.readingDirection === ReadingDirection.WEBTOON
    },
    progress(): number {
      return this.page / this.pagesCount * 100
    },
    pagesCount(): number {
      return this.pages.length
    },
    bookTitle(): string {
      return getBookTitleCompact(this.book.metadata.title, this.series.metadata.title, this.book.oneshot ? undefined : this.book.metadata.number)
    },
    readingDirectionText(): string {
      return this.$t(`enums.reading_direction.${this.readingDirection}`).toString()
    },
    shortcutsHelp(): object {
      let nav = []
      switch (this.readingDirection) {
        case ReadingDirection.LEFT_TO_RIGHT:
          nav.push(...shortcutsLTR, ...shortcutsAll)
          break
        case ReadingDirection.RIGHT_TO_LEFT:
          nav.push(...shortcutsRTL, ...shortcutsAll)
          break
        case ReadingDirection.VERTICAL:
          nav.push(...shortcutsVertical, ...shortcutsAll)
          break
        default:
          nav.push(...shortcutsAll)
      }
      let settings = [...shortcutsSettings]
      if (this.continuousReader) {
        settings.push(...shortcutsSettingsContinuous)
      } else {
        settings.push(...shortcutsSettingsPaged)
      }
      return {
        [this.$t('bookreader.shortcuts.reader_navigation').toString()]: nav,
        [this.$t('bookreader.shortcuts.settings').toString()]: settings,
        [this.$t('bookreader.shortcuts.menus').toString()]: shortcutsMenus,
      }
    },
    contextReadList(): boolean {
      return this.context.origin === ContextOrigin.READLIST
    },
    currentPage(): PageDtoWithUrl {
      return this.pages[this.page - 1]
    },
    nextReflowPage(): PageDtoWithUrl | undefined {
      if (!this.reflowMode || this.continuousReader || this.page >= this.pagesCount) return undefined
      return this.pages[this.page]
    },
    prefetchReflowPage(): PageDtoWithUrl | undefined {
      if (this.reflowPrefetchPage <= 0) return undefined
      return this.pages[this.reflowPrefetchPage - 1]
    },
    isPdf(): boolean {
      return this.book.media?.mediaProfile === 'PDF'
    },
    pdfTocFlattened(): TocEntry[] {
      return flattenToc(this.pdfToc, 1)
    },
    nightDisplay(): boolean {
      return this.backgroundColor === 'black'
    },
    activeReflowMode(): boolean {
      return this.isPdf && !this.continuousReader && (this.reflowMode || this.reflowSetupMode || this.k2ReflowMode)
    },
    reflowEnabled(): boolean {
      return this.reflowMode || this.reflowSetupMode
    },
    readerCropPageParity(): 'odd' | 'even' {
      return this.currentPage?.number % 2 === 0 ? 'even' : 'odd'
    },
    readerCropPageParityLabel(): string {
      return this.readerCropPageParity === 'even' ? '偶数页' : '奇数页'
    },
    readerCropImageSrc(): string {
      return this.readerCropImageUrl || this.currentPage?.url || ''
    },
    readerCropActiveRect(): object | undefined {
      const region = this.readerCropDraft || this.effectiveReaderCropRegion(this.readerCropPageParity, this.readerActiveCropRegion)
      if (!region) return undefined
      return {
        left: `${region.x}%`,
        top: `${region.y}%`,
        width: `${region.w}%`,
        height: `${region.h}%`,
      }
    },
    readerCropCanComplete(): boolean {
      return !!(this.readerCropDraft || this.effectiveReaderCropRegion(this.readerCropPageParity, this.readerActiveCropRegion))
    },
    normalReaderImageFilter(): string {
      const filters = []
      if (this.readerStrokeStrength > 0) {
        filters.push(`contrast(${(1 + this.readerStrokeStrength * 0.35).toFixed(2)})`)
        filters.push(`brightness(${(1 - this.readerStrokeStrength * 0.04).toFixed(2)})`)
      }
      if (this.nightDisplay) filters.push('invert(1) hue-rotate(180deg) brightness(0.92)')
      return filters.join(' ') || 'none'
    },
    reflowTargetWidth(): number {
      return this.$vuetify.breakpoint.width
    },
    reflowOptions(): object {
      return this.reflowSettings
    },
    reflowTouchHandlers(): object {
      return {
        left: this.reflowSwipeLeft,
        right: this.reflowSwipeRight,
        up: this.reflowSwipeUp,
        down: this.reflowSwipeDown,
      }
    },
    readerSwipeEnabled(): boolean {
      return this.swipe || this.$vuetify.breakpoint.smAndDown
    },
    reflowCacheKey(): string {
      return JSON.stringify({
        bookId: this.bookId,
        width: this.reflowTargetWidth,
        processingMode: this.reflowSettings.processingMode,
        rotation: this.readerRotation,
        autoCropBorder: this.reflowSettings.autoCropBorder,
        textScale: this.reflowSettings.textScale,
        columnCount: this.reflowSettings.columnCount,
        skewCorrection: this.reflowSettings.skewCorrection,
        threshold: this.reflowSettings.threshold,
        columnGap: this.reflowSettings.columnGap,
        wordGap: this.reflowSettings.wordGap,
        strokeStrength: this.reflowSettings.strokeStrength,
        contrastEnhancement: this.reflowSettings.contrastEnhancement,
        matchBackground: this.reflowSettings.matchBackground,
        verticalText: this.reflowSettings.verticalText,
        verticalDirection: this.reflowSettings.verticalDirection,
        marginTop: this.reflowSettings.marginTop,
        marginRight: this.reflowSettings.marginRight,
        marginBottom: this.reflowSettings.marginBottom,
        marginLeft: this.reflowSettings.marginLeft,
        cropRoisByParity: this.reflowSettings.cropRoisByParity,
        darkDisplay: this.nightDisplay,
        deskewDetectionVersion: 9,
        imageExclusionVersion: 2,
        detectionScaleVersion: 1,
        darkWordRenderVersion: 1,
      })
    },

    animations: {
      get: function (): boolean {
        return this.settings.animations
      },
      set: function (animations: boolean): void {
        this.settings.animations = animations
        this.$store.commit('setWebreaderAnimations', animations)
      },
    },
    scale: {
      get: function (): ScaleType {
        return this.settings.scale
      },
      set: function (scale: ScaleType): void {
        if (Object.values(ScaleType).includes(scale)) {
          this.settings.scale = scale
          this.$store.commit('setWebreaderPagedScale', scale)
        }
      },
    },
    continuousScale: {
      get: function (): ContinuousScaleType {
        return this.settings.continuousScale
      },
      set: function (scale: ContinuousScaleType): void {
        if (Object.values(ContinuousScaleType).includes(scale)) {
          this.settings.continuousScale = scale
          this.$store.commit('setWebreaderContinuousScale', scale)
        }
      },
    },
    sidePadding: {
      get: function (): number {
        return this.settings.sidePadding
      },
      set: function (padding: number): void {
        if (PaddingPercentage.includes(padding)) {
          this.settings.sidePadding = padding
          this.$store.commit('setWebreaderContinuousPadding', padding)
        }
      },
    },
    pageMargin: {
      get: function (): number {
        return this.settings.pageMargin
      },
      set: function (margin: number): void {
        if (MarginValues.includes(margin)) {
          this.settings.pageMargin = margin
          this.$store.commit('setWebreaderContinuousMargin', margin)
        }
      },
    },
    backgroundColor: {
      get: function (): string {
        return this.settings.backgroundColor
      },
      set: function (color: string): void {
        if (this.backgroundColors.map(x => x.value).includes(color)) {
          this.settings.backgroundColor = color
          this.$store.commit('setWebreaderBackground', color)
        }
      },
    },
    readerStrokeStrength: {
      get: function (): number {
        return this.settings.strokeStrength
      },
      set: function (strokeStrength: number): void {
        const normalized = Math.round(Math.max(0, Math.min(3, Number(strokeStrength) || 0)) * 10) / 10
        this.settings.strokeStrength = normalized
        this.saveReaderImageSettings()
      },
    },
    readerContrastEnhancement: {
      get: function (): boolean {
        return this.settings.contrastEnhancement === true
      },
      set: function (contrastEnhancement: boolean): void {
        const changed = this.settings.contrastEnhancement !== (contrastEnhancement === true)
        this.settings.contrastEnhancement = contrastEnhancement === true
        this.saveReaderImageSettings()
        if (changed) this.revokeReaderDeskewedPageUrls()
      },
    },
    readerRotation: {
      get: function (): number {
        return this.normalizedReaderRotation(this.settings.rotation)
      },
      set: function (rotation: number): void {
        const normalized = this.normalizedReaderRotation(rotation)
        const changed = this.normalizedReaderRotation(this.settings.rotation) !== normalized
        this.settings.rotation = normalized
        this.saveReaderImageSettings()
        if (changed) this.readerRotationChanged()
      },
    },
    readerRotationLabel(): string {
      const rotation = this.readerRotation
      return rotation > 0 ? `+${rotation}°` : `${rotation}°`
    },
    readerSkewCorrection: {
      get: function (): number {
        return this.settings.skewCorrection
      },
      set: function (skewCorrection: number): void {
        const normalized = this.normalizedReaderSkewCorrection(skewCorrection)
        const changed = this.settings.skewCorrection !== normalized
        this.settings.skewCorrection = normalized
        this.saveReaderImageSettings()
        if (changed) this.revokeReaderDeskewedPageUrls()
      },
    },
    readerSkewCorrectionLabel(): string {
      const prefix = this.readerSkewCorrection > 0 ? '+' : ''
      return `${prefix}${this.readerSkewCorrection.toFixed(1)}°`
    },
    readerCropRegionsByParity: {
      get: function (): any {
        return this.normalizedReaderCropRegionsByParity(this.settings.cropRegionsByParity)
      },
      set: function (cropRegionsByParity: any): void {
        const normalized = this.normalizedReaderCropRegionsByParity(cropRegionsByParity)
        this.$set(this.settings, 'cropRegionsByParity', normalized)
        this.saveReaderImageSettings()
      },
    },
    readerCropEnabled: {
      get: function (): boolean {
        return this.readerCropRegionsByParity.enabled
      },
      set: function (enabled: boolean): void {
        const current = this.readerCropRegionsByParity
        this.readerCropRegionsByParity = {...current, enabled}
        const hasSavedRegion = !!this.effectiveReaderCropRegion(this.readerCropPageParity, this.readerActiveCropRegion)
        if (enabled && !hasSavedRegion) this.$nextTick(() => this.startReaderCropMode())
      },
    },
    readingDirection: {
      get: function (): ReadingDirection {
        return this.settings.readingDirection
      },
      set: function (readingDirection: ReadingDirection): void {
        if (Object.values(ReadingDirection).includes(readingDirection)) {
          this.settings.readingDirection = readingDirection
          this.$store.commit('setWebreaderReadingDirection', readingDirection)
        }
      },
    },
    pageLayout: {
      get: function (): PagedReaderLayout {
        return this.settings.pageLayout
      },
      set: function (pageLayout: PagedReaderLayout): void {
        if (Object.values(PagedReaderLayout).includes(pageLayout)) {
          this.settings.pageLayout = pageLayout
          this.$store.commit('setWebreaderPagedPageLayout', pageLayout)
        }
      },
    },
    pagedLeftNavigationAction: {
      get: function (): PagedNavigationAction {
        return Object.values(PagedNavigationAction).includes(this.settings.leftNavigationAction)
          ? this.settings.leftNavigationAction
          : PagedNavigationAction.PREVIOUS
      },
      set: function (leftNavigationAction: PagedNavigationAction): void {
        const normalized = Object.values(PagedNavigationAction).includes(leftNavigationAction)
          ? leftNavigationAction
          : PagedNavigationAction.PREVIOUS
        this.settings.leftNavigationAction = normalized
        this.$store.commit('setWebreaderPagedLeftNavigationAction', normalized)
      },
    },
    swipe: {
      get: function (): boolean {
        return this.settings.swipe
      },
      set: function (swipe: boolean): void {
        this.settings.swipe = swipe
        this.$store.commit('setWebreaderSwipe', swipe)
      },
    },
    alwaysFullscreen: {
      get: function (): boolean {
        return this.settings.alwaysFullscreen
      },
      set: function (alwaysFullscreen: boolean): void {
        this.settings.alwaysFullscreen = alwaysFullscreen
        this.$store.commit('setWebreaderAlwaysFullscreen', alwaysFullscreen)
        if (alwaysFullscreen) this.enterFullscreen()
        else screenfull.isEnabled && screenfull.exit()
      },
    },
  },
  methods: {
    emptyReaderCropRegionsByParity(enabled: boolean = false): any {
      return defaultCropRegionsByParity(enabled)
    },
    normalizedReaderRotation(value: any): number {
      const numberValue = Number(value)
      if (!Number.isFinite(numberValue)) return 0
      const rounded = Math.round(numberValue / 90) * 90
      const normalized = ((rounded % 360) + 360) % 360
      if (normalized === 90) return 90
      if (normalized === 180) return 180
      if (normalized === 270) return -90
      return 0
    },
    setReaderRotation(rotation: number) {
      this.readerRotation = rotation
    },
    readerRotationChanged() {
      this.revokeReaderDeskewedPageUrls()
      this.revokeReaderCropImageUrl()
      this.reflowCache = {}
      this.clearReflowPrefetch()
      if (this.readerCropMode) this.$nextTick(this.prepareReaderCropImage)
    },
    readerImageSettingsStorageKey(bookId: string = this.readerImageSettingsBookId || this.bookId): string {
      return `${READER_IMAGE_SETTINGS_STORAGE_PREFIX}${bookId}`
    },
    loadReaderImageSettings(bookId: string = this.bookId) {
      if (!bookId) return
      this.loadingReaderImageSettings = true
      try {
        const defaults = defaultReaderImageSettings()
        let loaded = {} as Record<string, any>
        const serverSettings = this.readServerReaderImageSettings()[bookId]
        const localRaw = window.localStorage.getItem(this.readerImageSettingsStorageKey(bookId))
        const raw = serverSettings ? JSON.stringify(serverSettings) : localRaw
        if (raw) loaded = JSON.parse(raw)
        const normalized = this.normalizedReaderImageSettings({...defaults, ...loaded})
        this.applyReaderImageSettings(normalized)
        if (!serverSettings && localRaw) this.saveReaderImageSettingsServerDebounced?.(bookId, normalized)
      } catch (e) {
        this.applyReaderImageSettings(defaultReaderImageSettings())
        this.$debug('Unable to load reader image settings', e)
      } finally {
        this.$nextTick(() => this.loadingReaderImageSettings = false)
      }
    },
    applyReaderImageSettings(settings: Record<string, any>) {
      const normalized = this.normalizedReaderImageSettings(settings)
      const previousRotation = this.normalizedReaderRotation(this.settings.rotation)
      const previousSkew = this.settings.skewCorrection
      const previousContrastEnhancement = this.settings.contrastEnhancement
      this.settings.strokeStrength = normalized.strokeStrength
      this.settings.rotation = normalized.rotation
      this.settings.skewCorrection = normalized.skewCorrection
      this.settings.contrastEnhancement = normalized.contrastEnhancement
      this.$set(this.settings, 'cropRegionsByParity', normalized.cropRegionsByParity)
      if (previousRotation !== normalized.rotation || previousSkew !== normalized.skewCorrection || previousContrastEnhancement !== normalized.contrastEnhancement) this.revokeReaderDeskewedPageUrls()
      this.readerCropMode = false
      this.readerCropDraft = undefined
      this.readerCropDrawing = false
      this.readerActiveCropRegion = 0
      this.readerViewKey += 1
    },
    normalizedReaderImageSettings(settings: Record<string, any> = {}): Record<string, any> {
      settings = settings || {}
      return {
        strokeStrength: Math.round(Math.max(0, Math.min(3, Number(settings.strokeStrength) || 0)) * 10) / 10,
        rotation: this.normalizedReaderRotation(settings.rotation),
        skewCorrection: this.normalizedReaderSkewCorrection(settings.skewCorrection),
        contrastEnhancement: settings.contrastEnhancement === true,
        cropRegionsByParity: this.normalizedReaderCropRegionsByParity(settings.cropRegionsByParity),
      }
    },
    saveReaderImageSettings() {
      if (!this.bookId || this.loadingReaderImageSettings) return
      const settings = this.normalizedReaderImageSettings(this.settings)
      try {
        window.localStorage.setItem(this.readerImageSettingsStorageKey(), JSON.stringify(settings))
      } catch (e) {
        this.$debug('Unable to save reader image settings', e)
      }
      this.saveReaderImageSettingsServerDebounced?.(this.bookId, settings)
    },
    async saveReaderImageSettingsServer(bookId: string = this.readerImageSettingsBookId || this.bookId, settings: Record<string, any> = this.normalizedReaderImageSettings(this.settings)) {
      if (!bookId) return
      try {
        const all = this.readServerReaderImageSettings()
        all[bookId] = this.normalizedReaderImageSettings(settings)
        const newSettings = {} as Record<string, ClientSettingUserUpdateDto>
        newSettings[CLIENT_SETTING.WEBUI_READER_IMAGE_SETTINGS] = {
          value: JSON.stringify(all),
        }
        await this.$komgaSettings.updateClientSettingUser(newSettings)
        await this.$store.dispatch('getClientSettingsUser')
      } catch (e) {
        this.$debug('Unable to save reader image settings on server', e)
      }
    },
    readServerReaderImageSettings(): Record<string, any> {
      try {
        return JSON.parse(this.$store.state.komgaSettings.clientSettingsUser[CLIENT_SETTING.WEBUI_READER_IMAGE_SETTINGS]?.value) || {}
      } catch (e) {
        return {}
      }
    },
    adjustReaderSkewCorrection(delta: number) {
      this.readerSkewCorrection = this.normalizedReaderSkewCorrection(this.readerSkewCorrection + delta)
    },
    adjustReaderCropSkewCorrection(delta: number) {
      this.adjustReaderSkewCorrection(delta)
      this.prepareReaderCropImage()
    },
    setReaderCropSkewCorrection(event: Event) {
      const target = event.target as HTMLInputElement
      this.readerSkewCorrection = this.normalizedReaderSkewCorrection(Number(target.value))
      this.prepareReaderCropImage()
    },
    normalizedReaderSkewCorrection(value: any): number {
      const numberValue = Number(value)
      if (!Number.isFinite(numberValue)) return 0
      return Math.round(this.clampReflowNumber(numberValue, -10, 10, 0) * 2) / 2
    },
    normalizedReaderCropRegionsByParity(value: any): any {
      if (this.normalizedReaderCropRegionValue(value) && !value?.regions && value?.odd === undefined && value?.even === undefined) {
        const migrated = this.normalizedReaderCropRegionValue(value)
        const enabled = value?.enabled === true && !!migrated
        return {
          enabled,
          odd: enabled ? migrated : null,
          even: enabled ? migrated : null,
          regions: {
            odd: [enabled ? migrated : null, null],
            even: [enabled ? migrated : null, null],
          },
          explicit: {
            odd: enabled,
            even: enabled,
          },
          explicitRegions: {
            odd: [enabled, false],
            even: [enabled, false],
          },
        }
      }

      const odd = this.normalizedReaderCropRegionArray(value, 'odd')
      const even = this.normalizedReaderCropRegionArray(value, 'even')
      const oddExplicit = this.normalizedReaderCropExplicitArray(value, 'odd', odd)
      const evenExplicit = this.normalizedReaderCropExplicitArray(value, 'even', even)
      return {
        enabled: value?.enabled === true,
        odd: oddExplicit[0] ? odd[0] : null,
        even: evenExplicit[0] ? even[0] : null,
        regions: {
          odd: odd.map((region, index) => oddExplicit[index] ? region : null),
          even: even.map((region, index) => evenExplicit[index] ? region : null),
        },
        explicit: {
          odd: oddExplicit[0],
          even: evenExplicit[0],
        },
        explicitRegions: {
          odd: oddExplicit,
          even: evenExplicit,
        },
      }
    },
    normalizedReaderCropRegionArray(value: any, parity: 'odd' | 'even'): Array<any | null> {
      const regions = value?.regions?.[parity] || []
      const normalized = [
        this.normalizedReaderCropRegionValue(regions[0]) || this.normalizedReaderCropRegionValue(value?.[parity]),
        this.normalizedReaderCropRegionValue(regions[1]),
      ]
      return normalized
    },
    normalizedReaderCropExplicitArray(value: any, parity: 'odd' | 'even', regions: Array<any | null>): boolean[] {
      const explicitRegions = value?.explicitRegions?.[parity] || []
      return [
        regions[0] ? (explicitRegions[0] ?? value?.explicit?.[parity]) !== false : false,
        regions[1] ? explicitRegions[1] !== false : false,
      ]
    },
    normalizedReaderCropRegionValue(region: any): any | null {
      if (!region) return null
      const x = this.clampReaderCropNumber(region?.x, 0)
      const y = this.clampReaderCropNumber(region?.y, 0)
      const w = this.clampReaderCropNumber(region?.w, 100)
      const h = this.clampReaderCropNumber(region?.h, 100)
      return {
        x: Math.min(95, x),
        y: Math.min(95, y),
        w: Math.max(5, Math.min(100 - Math.min(95, x), w)),
        h: Math.max(5, Math.min(100 - Math.min(95, y), h)),
      }
    },
    clampReaderCropNumber(value: any, fallback: number): number {
      const numberValue = Number(value)
      if (!Number.isFinite(numberValue)) return fallback
      return Math.round(Math.max(0, Math.min(100, numberValue)) * 10) / 10
    },
    effectiveReaderCropRegion(parity: 'odd' | 'even', regionIndex: number): any | undefined {
      const regions = this.readerCropRegionsByParity
      if (!regions.enabled) return undefined
      const current = regions.regions?.[parity]?.[regionIndex]
      if (current) return current
      const fallbackParity = parity === 'odd' ? 'even' : 'odd'
      return regions.regions?.[fallbackParity]?.[regionIndex] || undefined
    },
    setReaderActiveCropRegion(region: number) {
      this.readerActiveCropRegion = region === 1 ? 1 : 0
      this.readerCropDraft = undefined
      this.readerCropDrawing = false
    },
    async startReaderCropMode() {
      if (!this.currentPage?.url) return
      this.showSettings = false
      await this.prepareReaderCropImage()
      this.readerCropMode = true
      this.readerCropDrawing = false
      const current = this.effectiveReaderCropRegion(this.readerCropPageParity, this.readerActiveCropRegion)
      this.readerCropDraft = current ? {...current} : undefined
    },
    cancelReaderCropMode() {
      this.readerCropMode = false
      this.readerCropDrawing = false
      this.readerCropDraft = undefined
      if (!this.promoteReaderCropImageUrl()) this.revokeReaderCropImageUrl()
    },
    completeReaderCropMode() {
      const pageNumber = this.currentPage?.number
      const region = this.readerCropDraft || this.effectiveReaderCropRegion(this.readerCropPageParity, this.readerActiveCropRegion)
      if (region) this.setReaderCropRegion(this.readerCropPageParity, this.readerActiveCropRegion, region)
      this.readerCropMode = false
      this.readerCropDrawing = false
      this.readerCropDraft = undefined
      if (!this.promoteReaderCropImageUrl()) this.revokeReaderCropImageUrl()
      this.resetReaderCropNavigation(pageNumber)
      this.refreshReaderView()
    },
    clearReaderCropRegion() {
      this.setReaderCropRegion(this.readerCropPageParity, this.readerActiveCropRegion, null)
      this.readerCropMode = false
      this.readerCropDrawing = false
      this.readerCropDraft = undefined
      if (!this.promoteReaderCropImageUrl()) this.revokeReaderCropImageUrl()
    },
    startReaderCrop(event: PointerEvent) {
      const point = this.readerCropPoint(event)
      const target = event.currentTarget as HTMLElement
      target.setPointerCapture(event.pointerId)
      this.readerCropDrawing = true
      this.readerCropStart = point
      this.readerCropDraft = {x: point.x, y: point.y, w: 1, h: 1}
      event.preventDefault()
    },
    moveReaderCrop(event: PointerEvent) {
      if (!this.readerCropDrawing) return
      this.readerCropDraft = this.normalizedReaderCropRect(this.readerCropStart, this.readerCropPoint(event))
      event.preventDefault()
    },
    finishReaderCrop(event: PointerEvent) {
      if (!this.readerCropDrawing) return
      this.readerCropDrawing = false
      const region = this.normalizedReaderCropRect(this.readerCropStart, this.readerCropPoint(event))
      if (region.w >= 5 && region.h >= 5) {
        this.readerCropDraft = region
      }
      event.preventDefault()
    },
    cancelReaderCropDraft() {
      this.readerCropDrawing = false
      this.readerCropDraft = undefined
    },
    readerCropPoint(event: PointerEvent): {x: number, y: number} {
      const image = this.$refs.readerCropImage as HTMLImageElement | undefined
      const rect = image?.getBoundingClientRect()
      if (!rect || rect.width <= 0 || rect.height <= 0) return {x: 0, y: 0}
      return {
        x: this.clampReaderCropNumber((event.clientX - rect.left) * 100 / rect.width, 0),
        y: this.clampReaderCropNumber((event.clientY - rect.top) * 100 / rect.height, 0),
      }
    },
    async prepareReaderCropImage() {
      const requestId = this.readerCropImageRequestId + 1
      this.readerCropImageRequestId = requestId
      const rotation = this.readerRotation
      const angle = this.readerSkewCorrection || 0
      if ((!rotation && !angle) || !this.currentPage?.url) {
        this.revokeReaderCropImageUrl()
        return
      }

      try {
        const image = await this.loadReaderCropImage(this.currentPage.url)
        if (requestId !== this.readerCropImageRequestId) return
        const canvas = this.processedReaderCropCanvas(image, rotation, angle)
        const url = await this.readerCropCanvasObjectUrl(canvas)
        if (requestId === this.readerCropImageRequestId && this.readerRotation === rotation && this.readerSkewCorrection === angle) {
          const previousUrl = this.readerCropImageUrl
          this.readerCropImageUrl = url
          if (previousUrl && previousUrl !== url) URL.revokeObjectURL(previousUrl)
        } else {
          URL.revokeObjectURL(url)
        }
      } catch (e) {
        if (requestId === this.readerCropImageRequestId) this.revokeReaderCropImageUrl()
      }
    },
    loadReaderCropImage(url: string): Promise<HTMLImageElement> {
      return new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => {
          if (image.naturalWidth > 0 && image.naturalHeight > 0) resolve(image)
          else reject(new Error('Decoded image is empty'))
        }
        image.onerror = () => reject(new Error('Unable to decode page image'))
        image.src = url
      })
    },
    processedReaderCropCanvas(image: HTMLImageElement, rotation: number, skewCorrection: number): HTMLCanvasElement {
      const rotatedCanvas = rotation ? this.rotatedReaderImageCanvas(image, rotation) : this.sourceReaderImageCanvas(image)
      return skewCorrection ? this.skewCorrectedReaderCropCanvas(rotatedCanvas, skewCorrection) : rotatedCanvas
    },
    sourceReaderImageCanvas(image: HTMLImageElement): HTMLCanvasElement {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')
      if (!context) return canvas
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0)
      return canvas
    },
    rotatedReaderImageCanvas(image: HTMLImageElement, degrees: number): HTMLCanvasElement {
      const rotation = this.normalizedReaderRotation(degrees)
      const quarterTurn = Math.abs(rotation) === 90
      const canvas = document.createElement('canvas')
      canvas.width = quarterTurn ? image.naturalHeight : image.naturalWidth
      canvas.height = quarterTurn ? image.naturalWidth : image.naturalHeight
      const context = canvas.getContext('2d')
      if (!context) return canvas
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.translate(canvas.width / 2, canvas.height / 2)
      context.rotate(rotation * Math.PI / 180)
      context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)
      return canvas
    },
    skewCorrectedReaderCropCanvas(sourceCanvas: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
      const canvas = document.createElement('canvas')
      canvas.width = sourceCanvas.width
      canvas.height = sourceCanvas.height
      const context = canvas.getContext('2d')
      if (!context) return canvas
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.translate(canvas.width / 2, canvas.height / 2)
      context.rotate(degrees * Math.PI / 180)
      context.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2)
      return canvas
    },
    readerCropCanvasObjectUrl(canvas: HTMLCanvasElement): Promise<string> {
      return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
          if (blob) resolve(URL.createObjectURL(blob))
          else reject(new Error('Unable to encode deskewed crop image'))
        }, 'image/jpeg', 0.95)
      })
    },
    revokeReaderCropImageUrl() {
      this.readerCropImageRequestId += 1
      if (this.readerCropImageUrl) URL.revokeObjectURL(this.readerCropImageUrl)
      this.readerCropImageUrl = ''
    },
    promoteReaderCropImageUrl(): boolean {
      if (!this.readerCropImageUrl || !this.currentPage?.number) return false
      this.readerCropImageRequestId += 1
      this.setReaderDeskewedPageUrl(this.currentPage.number, this.readerCropImageUrl)
      this.readerCropImageUrl = ''
      return true
    },
    setReaderDeskewedPageUrl(pageNumber: number, url: string) {
      const previous = this.readerDeskewedPageUrls[pageNumber]
      if (previous && previous !== url) URL.revokeObjectURL(previous)
      this.$set(this.readerDeskewedPageUrls, pageNumber, url)
    },
    revokeReaderDeskewedPageUrls() {
      Object.values(this.readerDeskewedPageUrls).forEach(url => URL.revokeObjectURL(url))
      this.readerDeskewedPageUrls = {}
    },
    normalizedReaderCropRect(start: {x: number, y: number}, end: {x: number, y: number}): any {
      const left = Math.min(start.x, end.x)
      const top = Math.min(start.y, end.y)
      const right = Math.max(start.x, end.x)
      const bottom = Math.max(start.y, end.y)
      return {
        x: Math.round(left * 10) / 10,
        y: Math.round(top * 10) / 10,
        w: Math.round((right - left) * 10) / 10,
        h: Math.round((bottom - top) * 10) / 10,
      }
    },
    setReaderCropRegion(parity: 'odd' | 'even', regionIndex: number, region: any | null) {
      const current = this.normalizedReaderCropRegionsByParity(this.readerCropRegionsByParity)
      const regions = {
        odd: (current.regions.odd || [null, null]).slice(0, 2),
        even: (current.regions.even || [null, null]).slice(0, 2),
      }
      const explicitRegions = {
        odd: (current.explicitRegions.odd || [false, false]).slice(0, 2),
        even: (current.explicitRegions.even || [false, false]).slice(0, 2),
      }
      regions[parity][regionIndex] = region
      explicitRegions[parity][regionIndex] = !!region
      const next = {
        ...current,
        enabled: true,
        regions,
        explicitRegions,
        odd: regions.odd[0],
        even: regions.even[0],
        explicit: {
          odd: explicitRegions.odd[0],
          even: explicitRegions.even[0],
        },
      }
      const hasAnyRegion = !!regions.odd[0] || !!regions.odd[1] || !!regions.even[0] || !!regions.even[1]
      this.readerCropRegionsByParity = hasAnyRegion ? next : this.emptyReaderCropRegionsByParity(false)
    },
    resetReaderCropNavigation(pageNumber: number | undefined = this.currentPage?.number) {
      this.setReaderActiveCropRegion(0)
      this.$nextTick(() => {
        const reader = this.$refs.pagedReader as any
        reader?.refreshCropNavigation?.(pageNumber)
      })
    },
    refreshReaderView() {
      this.readerViewKey += 1
    },
    readerCropRegionsOverlap(a: any, b: any): boolean {
      return a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y
    },
    enterFullscreen() {
      if (screenfull.isEnabled) return screenfull.request(document.documentElement, {navigationUI: 'hide'})
      return Promise.resolve()
    },
    switchFullscreen() {
      if (screenfull.isEnabled) screenfull.isFullscreen ? screenfull.exit() : this.enterFullscreen()
    },
    fullscreenChanged() {
      if (screenfull.isEnabled && screenfull.isFullscreen) this.fullscreenIcon = 'mdi-fullscreen-exit'
      else {
        this.fullscreenIcon = 'mdi-fullscreen'
        if (this.landscapeDisplay) {
          this.unlockOrientation()
          this.landscapeDisplay = false
        }
      }
    },
    keyPressed(e: KeyboardEvent) {
      if (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return
      if ((this.reflowMode || this.k2ReflowMode) && !this.continuousReader && this.keyPressedReflow(e)) return
      this.shortcuts[e.key]?.execute(this)
    },
    keyPressedReflow(e: KeyboardEvent): boolean {
      if (this.reflowCropMode) return true
      switch (e.key) {
        case ' ':
        case 'PageDown':
        case 'ArrowDown':
          this.activeReflowNextPage()
          return true
        case 'PageUp':
        case 'ArrowUp':
          this.activeReflowPreviousPage()
          return true
        case 'ArrowLeft':
          this.readingDirection === ReadingDirection.RIGHT_TO_LEFT ? this.activeReflowNextPage() : this.activeReflowPreviousPage()
          return true
        case 'ArrowRight':
          this.readingDirection === ReadingDirection.RIGHT_TO_LEFT ? this.activeReflowPreviousPage() : this.activeReflowNextPage()
          return true
        default:
          return false
      }
    },
    async setup(bookId: string, page?: number) {
      this.$debug('[setup]', `bookId:${bookId}`, `page:${page}`)
      this.reflowCache = {}
      this.clearReflowPrefetch()
      this.revokeReaderDeskewedPageUrls()
      this.book = await this.$komgaBooks.getBook(bookId)
      if (!this.isPdf) this.exitAllReflowModes()
      this.series = await this.$komgaSeries.getOneSeries(this.book.seriesId)
      this.showPdfToc = false
      this.pdfTocLoading = false
      this.pdfTocLoaded = false
      this.pdfToc = []

      // parse query params to get context and contextId
      if (this.$route.query.contextId && this.$route.query.context
        && Object.values(ContextOrigin).includes(this.$route.query.context as ContextOrigin)) {
        this.context = {
          origin: this.$route.query.context as ContextOrigin,
          id: this.$route.query.contextId as string,
        }
        this.book.context = this.context
      }

      if (this?.context.origin === ContextOrigin.READLIST) {
        this.contextName = (await (this.$komgaReadLists.getOneReadList(this.context.id))).name
        document.title = `Komga - ${this.contextName} - ${this.book.metadata.title}`
      } else {
        document.title = `Komga - ${this.bookTitle}`
      }

      // parse query params to get incognito mode
      this.incognito = !!(this.$route.query.incognito && this.$route.query.incognito.toString().toLowerCase() === 'true')

      const pageDtos = (await this.$komgaBooks.getBookPages(bookId))
      pageDtos.forEach((p: any) => p['url'] = this.getPageUrl(p))
      this.pages = pageDtos as PageDtoWithUrl[]

      this.$debug('[setup]', `pages count:${this.pagesCount}`, 'read progress:', this.book.readProgress)
      if (page && page >= 1 && page <= this.pagesCount) {
        this.goTo(page)
      } else if (this.book.readProgress?.completed === false) {
        this.goTo(this.book.readProgress?.page!!)
      } else {
        this.goToFirst()
      }

      // set non-persistent reading direction if exists in metadata
      if (this.series.metadata.readingDirection in ReadingDirection && this.readingDirection !== this.series.metadata.readingDirection) {
        // bypass setter so setting is not persisted
        this.settings.readingDirection = this.series.metadata.readingDirection as ReadingDirection
        this.sendNotificationReadingDirection(true)
      } else {
        this.sendNotificationReadingDirection(false)
      }

      try {
        if (this?.context.origin === ContextOrigin.READLIST) {
          this.siblingNext = await this.$komgaReadLists.getBookSiblingNext(this.context.id, bookId)
        } else {
          this.siblingNext = await this.$komgaBooks.getBookSiblingNext(bookId)
        }
      } catch (e) {
        this.siblingNext = {} as BookDto
      }
      try {
        if (this?.context.origin === ContextOrigin.READLIST) {
          this.siblingPrevious = await this.$komgaReadLists.getBookSiblingPrevious(this.context.id, bookId)
        } else {
          this.siblingPrevious = await this.$komgaBooks.getBookSiblingPrevious(bookId)
        }
      } catch (e) {
        this.siblingPrevious = {} as BookDto
      }
    },
    getPageUrl(page: PageDto): string {
      if (!this.supportedMediaTypes.includes(page.mediaType)) {
        return bookPageUrl(this.bookId, page.number, this.convertTo)
      } else {
        return bookPageUrl(this.bookId, page.number)
      }
    },
    jumpToPrevious() {
      if (this.jumpToPreviousBook) {
        this.previousBook()
      } else {
        this.jumpToPreviousBook = true
      }
    },
    jumpToNext() {
      if (this.jumpToNextBook) {
        this.nextBook()
      } else {
        this.jumpToNextBook = true
      }
    },
    previousBook() {
      if (!this.$_.isEmpty(this.siblingPrevious)) {
        this.jumpToPreviousBook = false
        this.$router.push({
          name: getBookReadRouteFromMedia(this.siblingPrevious.media),
          params: {bookId: this.siblingPrevious.id.toString()},
          query: {context: this.context.origin, contextId: this.context.id, incognito: this.incognito.toString()},
        })
      }
    },
    nextBook() {
      if (this.$_.isEmpty(this.siblingNext)) {
        this.closeBook()
      } else {
        this.jumpToNextBook = false
        this.$router.push({
          name: getBookReadRouteFromMedia(this.siblingNext.media),
          params: {bookId: this.siblingNext.id.toString()},
          query: {context: this.context.origin, contextId: this.context.id, incognito: this.incognito.toString()},
        })
      }
    },
    goTo(page: number) {
      this.$debug('[goTo]', `page:${page}`)
      this.page = page
      this.markProgress(page)
    },
    goToFirst() {
      this.goTo(1)
    },
    goToLast() {
      this.goTo(this.pagesCount)
    },
    updateRoute() {
      this.$router.replace({
        name: this.$route.name,
        params: {bookId: this.$route.params.bookId},
        query: {
          page: this.page.toString(),
          context: this.context.origin,
          contextId: this.context.id,
          incognito: this.incognito.toString(),
        },
      } as Location)
    },
    closeBook() {
      this.$router.push(
        {
          name: this.book.oneshot ? 'browse-oneshot' : 'browse-book',
          params: {bookId: this.bookId.toString(), seriesId: this.book.seriesId},
          query: {context: this.context.origin, contextId: this.context.id},
        })
    },
    changeReadingDir(dir: ReadingDirection) {
      this.readingDirection = dir
      const text = this.$t(`enums.reading_direction.${this.readingDirection}`)
      this.sendNotification(`${this.$t('bookreader.changing_reading_direction')}: ${text}`)
    },
    cycleScale() {
      if (this.continuousReader) {
        const enumValues = Object.values(ContinuousScaleType)
        const i = (enumValues.indexOf(this.settings.continuousScale) + 1) % (enumValues.length)
        this.continuousScale = enumValues[i]
        const text = this.$t(this.continuousScale)
        this.sendNotification(`${this.$t('bookreader.cycling_scale')}: ${text}`)
      } else {
        const enumValues = Object.values(ScaleType)
        const i = (enumValues.indexOf(this.settings.scale) + 1) % (enumValues.length)
        this.scale = enumValues[i]
        const text = this.$t(this.scale)
        this.sendNotification(`${this.$t('bookreader.cycling_scale')}: ${text}`)
      }
    },
    cycleSidePadding() {
      if (this.continuousReader) {
        const i = (PaddingPercentage.indexOf(this.settings.sidePadding) + 1) % (PaddingPercentage.length)
        this.sidePadding = PaddingPercentage[i]
        const text = this.sidePadding === 0 ? this.$t('bookreader.settings.side_padding_none').toString() : `${this.sidePadding}%`
        this.sendNotification(`${this.$t('bookreader.cycling_side_padding')}: ${text}`)
      }
    },
    cyclePageMargin() {
      if (this.continuousReader) {
        const i = (MarginValues.indexOf(this.settings.pageMargin) + 1) % (MarginValues.length)
        this.pageMargin = MarginValues[i]
        const text = this.pageMargin === 0 ? this.$t('bookreader.settings.side_padding_none').toString() : `${this.pageMargin}px`
        this.sendNotification(`${this.$t('bookreader.cycling_page_margin')}: ${text}`)
      }
    },
    cyclePageLayout() {
      if (this.continuousReader) return
      const enumValues = Object.values(PagedReaderLayout)
      const i = (enumValues.indexOf(this.settings.pageLayout) + 1) % (enumValues.length)
      this.pageLayout = enumValues[i]
      const text = this.$i18n.t(this.pageLayout)
      this.sendNotification(`${this.$t('bookreader.cycling_page_layout')}: ${text}`)
    },
    toggleToolbars() {
      this.showToolbars = !this.showToolbars
    },
    toggleExplorer() {
      this.showExplorer = !this.showExplorer
    },
    async togglePdfToc() {
      this.showPdfToc = !this.showPdfToc
      if (this.showPdfToc && !this.pdfTocLoaded) {
        await this.loadPdfToc()
      }
    },
    async openPdfToc() {
      this.showPdfToc = true
      if (!this.pdfTocLoaded) {
        await this.loadPdfToc()
      }
    },
    async loadPdfToc() {
      this.pdfTocLoading = true
      try {
        const manifest = await this.$komgaBooks.getBookWebPubManifestPdf(this.bookId)
        this.pdfToc = manifest.toc || []
        this.pdfTocLoaded = true
      } finally {
        this.pdfTocLoading = false
      }
    },
    goToPdfTocEntry(tocEntry: TocEntry) {
      const page = this.getPageFromPdfTocEntry(tocEntry)
      if (!page) return

      this.showPdfToc = false
      this.goTo(page)
    },
    getPageFromPdfTocEntry(tocEntry: TocEntry): number | undefined {
      if (!tocEntry.href) return undefined

      const match = new URL(tocEntry.href, window.location.origin).pathname.match(/\/pages\/(\d+)(?:\/raw)?$/)
      return match ? Number(match[1]) : undefined
    },
    toggleSettings() {
      this.showSettings = !this.showSettings
    },
    toggleHelp() {
      this.showHelp = !this.showHelp
    },
    toggleNightDisplay() {
      this.backgroundColor = this.nightDisplay ? 'white' : 'black'
    },
    reflowSettingsStorageKey(bookId: string = this.reflowSettingsBookId || this.bookId): string {
      return `${REFLOW_SETTINGS_STORAGE_PREFIX}${bookId}`
    },
    loadReflowSettings(bookId: string = this.bookId) {
      if (!bookId) return
      this.loadingReflowSettings = true
      try {
        const defaults = defaultReflowSettings()
        let loaded = {} as Record<string, any>
        const serverSettings = this.readServerReflowSettings()[bookId]
        const localRaw = window.localStorage.getItem(this.reflowSettingsStorageKey(bookId))
        const raw = serverSettings ? JSON.stringify(serverSettings) : localRaw
        if (raw) loaded = JSON.parse(raw)
        this.reflowSettings = this.normalizedReflowSettings({...defaults, ...loaded})
        if (!serverSettings && localRaw) this.saveReflowSettingsServerDebounced?.(bookId, this.reflowSettings)
      } catch (e) {
        this.reflowSettings = defaultReflowSettings()
        this.$debug('Unable to load PDF reflow settings', e)
      } finally {
        this.$nextTick(() => this.loadingReflowSettings = false)
      }
    },
    saveReflowSettings() {
      if (!this.bookId) return
      const settings = this.normalizedReflowSettings(this.reflowSettings)
      try {
        window.localStorage.setItem(this.reflowSettingsStorageKey(), JSON.stringify(settings))
      } catch (e) {
        this.$debug('Unable to save PDF reflow settings', e)
      }
      this.saveReflowSettingsServerDebounced?.(this.bookId, settings)
    },
    async saveReflowSettingsServer(bookId: string = this.reflowSettingsBookId || this.bookId, settings: Record<string, any> = this.normalizedReflowSettings(this.reflowSettings)) {
      if (!bookId) return
      try {
        const all = this.readServerReflowSettings()
        all[bookId] = this.normalizedReflowSettings(settings)
        const newSettings = {} as Record<string, ClientSettingUserUpdateDto>
        newSettings[CLIENT_SETTING.WEBUI_PDF_REFLOW_SETTINGS] = {
          value: JSON.stringify(all),
        }
        await this.$komgaSettings.updateClientSettingUser(newSettings)
        await this.$store.dispatch('getClientSettingsUser')
      } catch (e) {
        this.$debug('Unable to save PDF reflow settings on server', e)
      }
    },
    readServerReflowSettings(): Record<string, any> {
      try {
        return JSON.parse(this.$store.state.komgaSettings.clientSettingsUser[CLIENT_SETTING.WEBUI_PDF_REFLOW_SETTINGS]?.value) || {}
      } catch (e) {
        return {}
      }
    },
    normalizedReflowSettings(settings: Record<string, any>): object {
      return {
        processingMode: settings.processingMode === 'server' ? 'server' : 'local',
        autoCropBorder: typeof settings.autoCropBorder === 'boolean' ? settings.autoCropBorder : this.reflowSettings.autoCropBorder,
        textScale: this.clampReflowNumber(settings.textScale, 10, 140, this.reflowSettings.textScale),
        columnCount: Math.round(this.clampReflowNumber(settings.columnCount, 1, 4, this.reflowSettings.columnCount)),
        skewCorrection: this.normalizedReflowSkewCorrection(settings.skewCorrection),
        threshold: this.clampReflowNumber(settings.threshold, 50, 230, this.reflowSettings.threshold),
        columnGap: this.clampReflowNumber(settings.columnGap, 5, 80, this.reflowSettings.columnGap),
        wordGap: this.clampReflowNumber(settings.wordGap, 1, 30, this.reflowSettings.wordGap),
        strokeStrength: Math.round(this.clampReflowNumber(settings.strokeStrength, 0.1, 3, this.reflowSettings.strokeStrength) * 10) / 10,
        contrastEnhancement: settings.contrastEnhancement === true,
        matchBackground: settings.matchBackground === true,
        blockSpacing: Math.round(this.clampReflowNumber(settings.blockSpacing, 0, 24, this.reflowSettings.blockSpacing)),
        verticalText: typeof settings.verticalText === 'boolean' ? settings.verticalText : this.reflowSettings.verticalText,
        verticalDirection: settings.verticalDirection === 'ltr' ? 'ltr' : 'rtl',
        marginTop: this.clampReflowNumber(settings.marginTop, 0, 45, this.reflowSettings.marginTop),
        marginRight: this.clampReflowNumber(settings.marginRight, 0, 45, this.reflowSettings.marginRight),
        marginBottom: this.clampReflowNumber(settings.marginBottom, 0, 45, this.reflowSettings.marginBottom),
        marginLeft: this.clampReflowNumber(settings.marginLeft, 0, 45, this.reflowSettings.marginLeft),
        cropRoisByParity: this.normalizedReflowCropRois(settings.cropRoisByParity),
        k2Settings: this.normalizedK2ReflowSettings(settings.k2Settings),
      }
    },
    normalizedK2ReflowSettings(settings: Record<string, any> = {}): Record<string, any> {
      settings = settings || {}
      return {
        textScale: this.clampReflowNumber(settings.textScale, 20, 160, this.reflowSettings.k2Settings.textScale),
        maxColumns: Math.round(this.clampReflowNumber(settings.maxColumns, 1, 4, this.reflowSettings.k2Settings.maxColumns)),
        threshold: this.clampReflowNumber(settings.threshold, 50, 230, this.reflowSettings.k2Settings.threshold),
        strokeStrength: Math.round(this.clampReflowNumber(settings.strokeStrength, 0, 3, this.reflowSettings.k2Settings.strokeStrength) * 10) / 10,
        contrastEnhancement: settings.contrastEnhancement === true,
        matchBackground: settings.matchBackground === true,
        wordGap: Math.round(this.clampReflowNumber(settings.wordGap, 1, 30, this.reflowSettings.k2Settings.wordGap)),
        outputPadding: Math.round(this.clampReflowNumber(settings.outputPadding, 0, 48, this.reflowSettings.k2Settings.outputPadding)),
      }
    },
    normalizedReflowCropRois(cropRoisByParity: any): Record<string, any> {
      const odd = this.normalizedReflowCropRegionRois(cropRoisByParity, 'odd')
      const even = this.normalizedReflowCropRegionRois(cropRoisByParity, 'even')
      const oddExplicit = this.normalizedReflowCropRegionExplicit(cropRoisByParity, 'odd', odd)
      const evenExplicit = this.normalizedReflowCropRegionExplicit(cropRoisByParity, 'even', even)
      return {
        odd: odd[0],
        even: even[0],
        regions: {
          odd,
          even,
        },
        explicit: {
          odd: oddExplicit[0],
          even: evenExplicit[0],
        },
        explicitRegions: {
          odd: oddExplicit,
          even: evenExplicit,
        },
      }
    },
    normalizedReflowCropRegionRois(cropRoisByParity: any, parity: 'odd' | 'even'): Array<object | null> {
      const regions = cropRoisByParity?.regions?.[parity] || []
      const normalized = [
        this.normalizedReflowCropRoi(regions[0]) || this.normalizedReflowCropRoi(cropRoisByParity?.[parity]),
        this.normalizedReflowCropRoi(regions[1]),
      ]
      if (normalized[0] && normalized[1] && this.reflowCropRoisOverlap(normalized[0], normalized[1])) normalized[1] = null
      return normalized
    },
    normalizedReflowCropRegionExplicit(cropRoisByParity: any, parity: 'odd' | 'even', regions: Array<object | null>): boolean[] {
      const explicit = cropRoisByParity?.explicit || {}
      const explicitRegions = cropRoisByParity?.explicitRegions?.[parity] || []
      return [
        regions[0] ? (explicitRegions[0] ?? explicit[parity]) !== false : false,
        regions[1] ? explicitRegions[1] !== false : false,
      ]
    },
    normalizedReflowCropRoi(roi: any): object | null {
      if (!roi) return null
      const x = Number(roi.x)
      const y = Number(roi.y)
      const w = Number(roi.w)
      const h = Number(roi.h)
      if (![x, y, w, h].every(Number.isFinite) || w <= 15 || h <= 15) return null
      return {x, y, w, h}
    },
    normalizedReflowSkewCorrection(value: any): number {
      const numberValue = Number(value)
      if (!Number.isFinite(numberValue)) return 0
      return Math.round(this.clampReflowNumber(numberValue, -10, 10, 0) * 2) / 2
    },
    reflowCropRoisOverlap(a: any, b: any): boolean {
      return a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y
    },
    clampReflowNumber(value: any, min: number, max: number, fallback: number): number {
      const numberValue = Number(value)
      if (!Number.isFinite(numberValue)) return fallback
      return Math.max(min, Math.min(max, numberValue))
    },
    toggleReflowMode() {
      if (!this.isPdf) return

      if (this.reflowMode) {
        this.exitReflowMode()
        return
      }

      if (this.reflowSetupMode) {
        this.startReflowMode()
        return
      }

      this.openReflowSetupMode()
    },
    openReflowSetupMode() {
      if (!this.isPdf) return

      this.reflowSetupMode = true
      this.reflowMode = false
      this.k2ReflowMode = false
      this.reflowStartAtEnd = false
      this.reflowCropMode = false
      this.clearReflowPrefetch()
      this.$nextTick(() => this.scrollToPageEdge('top'))
    },
    startReflowMode() {
      if (!this.isPdf) return

      this.reflowSetupMode = false
      this.reflowMode = true
      this.k2ReflowMode = false
      this.reflowStartAtEnd = false
      this.reflowCropMode = false
      this.clearReflowPrefetch()
      this.$nextTick(() => this.scrollToPageEdge('top'))
    },
    setReflowEnabled(enabled: boolean) {
      if (enabled === true) {
        if (!this.reflowEnabled) this.openReflowSetupMode()
      } else {
        this.exitReflowMode()
      }
    },
    exitReflowMode() {
      this.reflowSetupMode = false
      this.reflowMode = false
      this.reflowCropMode = false
      this.reflowStartAtEnd = false
      this.clearReflowPrefetch()
      this.$nextTick(() => this.scrollToPageEdge('top'))
    },
    toggleK2ReflowMode() {
      if (!this.isPdf) return

      if (this.k2ReflowMode) {
        this.exitK2ReflowMode()
        return
      }

      this.k2ReflowMode = true
      this.reflowSetupMode = false
      this.reflowMode = false
      this.reflowCropMode = false
      this.reflowStartAtEnd = false
      this.k2ReflowStartAtEnd = false
      this.clearReflowPrefetch()
      this.$nextTick(() => this.scrollToPageEdge('top'))
    },
    exitK2ReflowMode() {
      this.k2ReflowMode = false
      this.reflowCropMode = false
      this.$nextTick(() => this.scrollToPageEdge('top'))
    },
    exitAllReflowModes() {
      this.reflowSetupMode = false
      this.reflowMode = false
      this.k2ReflowMode = false
      this.reflowCropMode = false
      this.reflowStartAtEnd = false
      this.clearReflowPrefetch()
    },
    k2PreviousPage() {
      const reflow = this.$refs.k2ReflowedPage as any
      reflow?.previousPage?.()
    },
    k2NextPage() {
      const reflow = this.$refs.k2ReflowedPage as any
      reflow?.nextPage?.()
    },
    activeReflowPreviousPage() {
      this.k2ReflowMode ? this.k2PreviousPage() : this.reflowPreviousPage()
    },
    activeReflowNextPage() {
      this.k2ReflowMode ? this.k2NextPage() : this.reflowNextPage()
    },
    reflowTouchEnabled(): boolean {
      return (this.reflowMode || this.k2ReflowMode) && this.readerSwipeEnabled && !this.reflowCropMode
    },
    reflowSwipeLeft() {
      if (!this.reflowTouchEnabled() || this.readingDirection === ReadingDirection.VERTICAL) return
      this.activeReflowNextPage()
    },
    reflowSwipeRight() {
      if (!this.reflowTouchEnabled() || this.readingDirection === ReadingDirection.VERTICAL) return
      this.activeReflowPreviousPage()
    },
    reflowSwipeUp() {
      if (!this.reflowTouchEnabled() || this.readingDirection !== ReadingDirection.VERTICAL) return
      this.activeReflowNextPage()
    },
    reflowSwipeDown() {
      if (!this.reflowTouchEnabled() || this.readingDirection !== ReadingDirection.VERTICAL) return
      this.activeReflowPreviousPage()
    },
    k2SourcePreviousPage() {
      if (this.page > 1) {
        this.k2ReflowStartAtEnd = true
        this.goTo(this.page - 1)
      } else {
        this.jumpToPrevious()
      }
    },
    k2SourceNextPage() {
      if (this.page < this.pagesCount) {
        this.k2ReflowStartAtEnd = false
        this.goTo(this.page + 1)
      } else {
        this.jumpToNext()
      }
    },
    setReflowTextScale(textScale: number) {
      this.reflowSettings.textScale = textScale
    },
    setReflowProcessingMode(processingMode: string) {
      this.reflowSettings.processingMode = processingMode === 'server' ? 'server' : 'local'
    },
    setReflowColumnCount(columnCount: number) {
      this.reflowSettings.columnCount = Math.round(Math.max(1, Math.min(4, columnCount)))
    },
    setReflowSkewCorrection(skewCorrection: number) {
      this.reflowSettings.skewCorrection = this.normalizedReflowSkewCorrection(skewCorrection)
    },
    setReflowVerticalText(verticalText: boolean) {
      this.reflowSettings.verticalText = verticalText
    },
    setReflowVerticalDirection(verticalDirection: string) {
      this.reflowSettings.verticalDirection = verticalDirection === 'ltr' ? 'ltr' : 'rtl'
    },
    setReflowStrokeStrength(strokeStrength: number) {
      this.reflowSettings.strokeStrength = Math.round(Math.max(0.1, Math.min(3, strokeStrength)) * 10) / 10
    },
    setReflowContrastEnhancement(contrastEnhancement: boolean) {
      this.reflowSettings.contrastEnhancement = contrastEnhancement === true
    },
    setReflowMatchBackground(matchBackground: boolean) {
      this.reflowSettings.matchBackground = matchBackground === true
    },
    setReflowBlockSpacing(blockSpacing: number) {
      this.reflowSettings.blockSpacing = Math.max(0, Math.min(24, Math.round(blockSpacing)))
    },
    setReflowCropMode(cropMode: boolean) {
      this.reflowCropMode = cropMode
      if (cropMode) this.clearReflowPrefetch()
    },
    setReflowCropRois(cropRoisByParity: Record<string, any>) {
      const normalized = this.normalizedReflowCropRois(cropRoisByParity)
      this.$set(this.reflowSettings.cropRoisByParity, 'odd', normalized.odd)
      this.$set(this.reflowSettings.cropRoisByParity, 'even', normalized.even)
      this.$set(this.reflowSettings.cropRoisByParity, 'regions', normalized.regions)
      this.$set(this.reflowSettings.cropRoisByParity, 'explicit', normalized.explicit)
      this.$set(this.reflowSettings.cropRoisByParity, 'explicitRegions', normalized.explicitRegions)
      this.clearReflowPrefetch()
    },
    setK2ReflowSettings(settings: Record<string, any>) {
      const normalized = this.normalizedK2ReflowSettings(settings)
      Object.keys(normalized).forEach(key => {
        this.$set(this.reflowSettings.k2Settings, key, normalized[key])
      })
    },
    cachedReflowEntry(page: PageDtoWithUrl | undefined): any {
      if (!page || this.reflowCropMode) return undefined
      return this.reflowCache[this.reflowCacheEntryKey(page.number, this.reflowCacheKey)]
    },
    cachedReflowItems(page: PageDtoWithUrl | undefined): any[] | undefined {
      const entry = this.cachedReflowEntry(page)
      if (Array.isArray(entry)) return entry
      return entry?.items
    },
    cachedReflowBackground(page: PageDtoWithUrl | undefined): string {
      const entry = this.cachedReflowEntry(page)
      return Array.isArray(entry) ? '' : entry?.pageBackground || ''
    },
    cachedReflowTransferStats(page: PageDtoWithUrl | undefined): any {
      const entry = this.cachedReflowEntry(page)
      return Array.isArray(entry) ? undefined : entry?.transferStats
    },
    cacheReflowPage(payload: {pageNumber: number, cacheKey: string, items: any[], pageBackground?: string, transferStats?: any}) {
      if (payload.cacheKey !== this.reflowCacheKey) return
      this.$set(this.reflowCache, this.reflowCacheEntryKey(payload.pageNumber, payload.cacheKey), {
        items: payload.items,
        pageBackground: payload.pageBackground || '',
        transferStats: payload.transferStats,
      })
      this.pruneReflowCache()
      if (payload.pageNumber === this.page) this.scheduleNextReflowPrefetch()
    },
    reflowPageUrl(page: PageDtoWithUrl | undefined): string {
      if (!page) return ''
      return bookPageReflowUrl(this.bookId, page.number)
    },
    cacheCurrentReflowPage() {
      const reflow = this.$refs.reflowedPage as any
      const payload = reflow?.currentCachePayload?.()
      if (payload) this.cacheReflowPage(payload)
    },
    reflowCacheEntryKey(pageNumber: number, cacheKey: string): string {
      return `${pageNumber}|${cacheKey}`
    },
    clearReflowCacheForPage(pageNumber: number) {
      Object.keys(this.reflowCache).forEach(key => {
        const separator = key.indexOf('|')
        const cachedPageNumber = Number(key.substring(0, separator))
        if (cachedPageNumber === pageNumber) this.$delete(this.reflowCache, key)
      })
    },
    forceCurrentReflow() {
      this.clearReflowPrefetch()
      this.reflowPrefetchPage = 0
      if (this.currentPage?.number) this.clearReflowCacheForPage(this.currentPage.number)
      this.$nextTick(() => {
        const reflow = this.$refs.reflowedPage as any
        reflow?.forceReflow?.()
      })
    },
    pruneReflowCache() {
      Object.keys(this.reflowCache).forEach(key => {
        const separator = key.indexOf('|')
        const pageNumber = Number(key.substring(0, separator))
        const cacheKey = key.substring(separator + 1)
        if (cacheKey !== this.reflowCacheKey || Math.abs(pageNumber - this.page) > REFLOW_CACHE_RADIUS) this.$delete(this.reflowCache, key)
      })
    },
    clearReflowPrefetch() {
      if (this.reflowPrefetchTimer !== undefined) {
        window.clearTimeout(this.reflowPrefetchTimer)
        this.reflowPrefetchTimer = undefined
      }
      if (this.reflowPrefetchIdleHandle !== undefined) {
        const cancelIdleCallback = (window as any).cancelIdleCallback
        if (cancelIdleCallback) cancelIdleCallback(this.reflowPrefetchIdleHandle)
        else window.clearTimeout(this.reflowPrefetchIdleHandle)
        this.reflowPrefetchIdleHandle = undefined
      }
      this.reflowPrefetchPage = 0
    },
    scheduleNextReflowPrefetch() {
      this.clearReflowPrefetch()
      if (!this.nextReflowPage || this.reflowCropMode) return
      const sourcePage = this.page
      const nextPageNumber = this.nextReflowPage.number
      this.reflowPrefetchTimer = window.setTimeout(() => {
        this.reflowPrefetchTimer = undefined
        const startPrefetch = () => {
          this.reflowPrefetchIdleHandle = undefined
          if (this.page === sourcePage && this.nextReflowPage?.number === nextPageNumber && !this.reflowCropMode) this.reflowPrefetchPage = nextPageNumber
        }
        const requestIdleCallback = (window as any).requestIdleCallback
        if (requestIdleCallback) {
          this.reflowPrefetchIdleHandle = requestIdleCallback(startPrefetch, {timeout: 2500})
        } else {
          this.reflowPrefetchIdleHandle = window.setTimeout(startPrefetch, 350)
        }
      }, REFLOW_PREFETCH_DELAY_MS)
    },
    reflowPreviousPage() {
      const reflow = this.$refs.reflowedPage as any
      reflow?.previousPage?.()
    },
    reflowNextPage() {
      const reflow = this.$refs.reflowedPage as any
      reflow?.nextPage?.()
    },
    reflowSourcePreviousPage() {
      this.cacheCurrentReflowPage()
      if (this.page > 1) {
        this.reflowStartAtEnd = true
        this.goTo(this.page - 1)
      } else {
        this.jumpToPrevious()
      }
    },
    reflowSourceNextPage() {
      this.cacheCurrentReflowPage()
      if (this.page < this.pagesCount) {
        this.reflowStartAtEnd = false
        this.goTo(this.page + 1)
      } else {
        this.jumpToNext()
      }
    },
    scrollToPageEdge(position: 'top' | 'bottom') {
      const scroll = () => {
        const scrollingElement = document.scrollingElement || document.documentElement
        const top = position === 'bottom' ? scrollingElement.scrollHeight : 0
        window.scrollTo({top, left: 0, behavior: 'auto'})
        scrollingElement.scrollTop = top
        document.documentElement.scrollTop = position === 'bottom' ? document.documentElement.scrollHeight : 0
        document.body.scrollTop = position === 'bottom' ? document.body.scrollHeight : 0
      }
      this.$nextTick(() => {
        scroll()
        window.requestAnimationFrame(scroll)
        window.setTimeout(scroll, 100)
      })
    },
    async toggleLandscapeDisplay() {
      const landscapeDisplay = !this.landscapeDisplay
      if (landscapeDisplay) {
        await this.enterFullscreen()
        const locked = await this.lockOrientation('landscape')
        if (!locked) return
      } else {
        this.unlockOrientation()
      }
      this.landscapeDisplay = landscapeDisplay
      window.scrollTo(0, 0)
    },
    async lockOrientation(orientation: string): Promise<boolean> {
      const screenOrientation = (screen as any).orientation
      if (!screenOrientation?.lock) return false
      try {
        await screenOrientation.lock(orientation)
        return true
      } catch (e) {
        return false
      }
    },
    unlockOrientation() {
      const screenOrientation = (screen as any).orientation
      screenOrientation?.unlock?.()
    },
    closeDialog() {
      if (this.showExplorer) {
        this.showExplorer = false
        return
      }
      if (this.showPdfToc) {
        this.showPdfToc = false
        return
      }
      if (this.showSettings) {
        this.showSettings = false
        return
      }
      if (this.showToolbars) {
        this.showToolbars = false
        return
      }
      this.closeBook()
    },
    sendNotificationReadingDirection(fromMetadata: boolean) {
      this.notificationReadingDirection.fromMetadata = fromMetadata
      this.notificationReadingDirection.enabled = true
    },
    sendNotification(message: string, timeout: number = 4000) {
      this.notification.timeout = timeout
      this.notification.message = message
      this.notification.enabled = true
    },
    markProgress: debounce(function (this: any, page: number) {
      if (!this.incognito) {
        this.$komgaBooks.updateReadProgress(this.bookId, {page: page})
      }
    }, 50),
    downloadCurrentPage() {
      new jsFileDownloader({
        url: `${this.currentPage.url}?contentNegotiation=false`,
        filename: `${this.book.name}-${this.currentPage.number}.${this.currentPage.fileName.split('.').pop()}`,
        withCredentials: true,
        forceDesktopMode: true,
      })
    },
    async setCurrentPageAsPoster(type: ItemTypes) {
      const imageFile = await getFileFromUrl(`${this.currentPage.url}?contentNegotiation=false`, 'poster', 'image/jpeg', {credentials: 'include'})
      const newImageFile = await resizeImageFile(imageFile)
      switch (type) {
        case ItemTypes.BOOK:
          await this.$komgaBooks.uploadThumbnail(this.book.id, newImageFile, true)
          this.sendNotification(`${this.$t('bookreader.notification_poster_set_book')}`)
          break
        case ItemTypes.SERIES:
          await this.$komgaSeries.uploadThumbnail(this.series.id, newImageFile, true)
          this.sendNotification(`${this.$t('bookreader.notification_poster_set_series')}`)
          break
        case ItemTypes.READLIST:
          await this.$komgaReadLists.uploadThumbnail(this.context.id, newImageFile, true)
          this.sendNotification(`${this.$t('bookreader.notification_poster_set_readlist')}`)
          break
      }
    },
  },
})
</script>
<style scoped>
.settings {
  z-index: 2;
}

.full-height {
  height: 100%;
}

.full-width {
  width: 100%;
}

.reader-toolbar-title {
  min-width: 0;
}

.reader-landscape-shell {
  overflow: visible;
}

.reader-frame {
  position: relative;
  width: 100%;
}

.reader-frame-landscape {
  overflow: visible;
}

.reflow-reader {
  width: 100%;
  min-height: 100%;
}

.reflow-prefetch {
  position: fixed;
  width: 1px;
  height: 1px;
  left: -10000px;
  top: -10000px;
  overflow: hidden;
  pointer-events: none;
}

.reflow-click-left {
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  width: 30vw;
  z-index: 3;
}

.reflow-click-right {
  position: fixed;
  top: 0;
  right: 0;
  height: 100vh;
  width: 30vw;
  z-index: 3;
}

.reflow-click-center {
  position: fixed;
  top: 0;
  left: 30vw;
  height: 100vh;
  width: 40vw;
  z-index: 3;
}

.reader-crop-panel {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 8px;
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.86);
}

.reader-crop-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 12px;
  min-height: 36px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.reader-rotation-setting {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.reader-crop-skew-control {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.reader-crop-skew-control input[type="range"] {
  width: min(140px, 36vw);
}

.reader-crop-stage {
  position: relative;
  display: inline-block;
  max-width: 100%;
  max-height: calc(100vh - 60px);
  cursor: crosshair;
  touch-action: none;
  user-select: none;
}

.reader-crop-image {
  display: block;
  max-width: 100%;
  max-height: calc(100vh - 60px);
  object-fit: contain;
}

.reader-crop-rect {
  position: absolute;
  border: 2px dashed #90caf9;
  background: rgba(144, 202, 249, 0.18);
  box-sizing: border-box;
  pointer-events: none;
}
</style>
<style>
.html-reader::-webkit-scrollbar {
  display: none;
}

.html-reader {
  scrollbar-width: none;
  overscroll-behavior: none;
}

.reader-shell {
  --reflow-text-background: #fff;
  --reflow-text-filter: none;
}

.reader-night-mode {
  --reflow-text-background: #000;
  --reflow-text-filter: none;
}

.reader-night-mode .reader-frame img:not(.word-block):not(.k2-word),
.reader-night-mode .reader-frame canvas {
  filter: invert(1) hue-rotate(180deg) brightness(0.92);
}

.reader-frame .reflow-wrapper,
.reader-frame .k2-output {
  background: var(--reflow-text-background);
}

.reader-frame img.word-block,
.reader-frame img.k2-word {
  background: var(--reflow-text-background);
  filter: var(--reflow-text-filter);
}

.reader-night-mode .reader-frame img.word-block,
.reader-night-mode .reader-frame img.k2-word {
  background: var(--reflow-text-background);
  filter: var(--reflow-text-filter);
}

</style>
