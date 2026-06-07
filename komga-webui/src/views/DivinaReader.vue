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
            <v-icon>{{ reflowMode ? 'mdi-file-document' : 'mdi-file-document-outline' }}</v-icon>
          </v-btn>

          <v-btn
            v-if="isPdf && $vuetify.breakpoint.mdAndUp"
            icon
            :disabled="continuousReader"
            title="K2 Reflow"
            @click="toggleK2ReflowMode"
          >
            <v-icon>{{ k2ReflowMode ? 'mdi-text-box' : 'mdi-text-box-outline' }}</v-icon>
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
                    <v-icon>{{ reflowMode ? 'mdi-file-document' : 'mdi-file-document-outline' }}</v-icon>
                  </v-list-item-icon>
                  <v-list-item-title>Reflow</v-list-item-title>
                </v-list-item>
                <v-list-item v-if="isPdf" :disabled="continuousReader" @click="toggleK2ReflowMode">
                  <v-list-item-icon>
                    <v-icon>{{ k2ReflowMode ? 'mdi-text-box' : 'mdi-text-box-outline' }}</v-icon>
                  </v-list-item-icon>
                  <v-list-item-title>K2 Reflow</v-list-item-title>
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
      >
        <k2-reflowed-page
          ref="k2ReflowedPage"
          :page="currentPage"
          :target-width="reflowTargetWidth"
          :start-at-end="k2ReflowStartAtEnd"
          :crop-rois-by-parity="reflowSettings.cropRoisByParity"
          :settings="reflowSettings.k2Settings"
          @exit-k2-reflow="exitK2ReflowMode"
          @source-previous="k2SourcePreviousPage"
          @source-next="k2SourceNextPage"
          @crop-mode-change="setReflowCropMode"
          @crop-rois-change="setReflowCropRois"
          @settings-change="setK2ReflowSettings"
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
        v-else-if="isPdf && reflowMode && !continuousReader"
        class="reflow-reader"
      >
        <reflowed-page
          ref="reflowedPage"
          :page="currentPage"
          :target-width="reflowTargetWidth"
          :options="reflowOptions"
          :cached-items="cachedReflowItems(currentPage)"
          :cached-page-background="cachedReflowBackground(currentPage)"
          :cache-key="reflowCacheKey"
          :start-at-end="reflowStartAtEnd"
          @text-scale-change="setReflowTextScale"
          @column-count-change="setReflowColumnCount"
          @vertical-text-change="setReflowVerticalText"
          @vertical-direction-change="setReflowVerticalDirection"
          @stroke-strength-change="setReflowStrokeStrength"
          @block-spacing-change="setReflowBlockSpacing"
          @crop-mode-change="setReflowCropMode"
          @crop-rois-change="setReflowCropRois"
          @exit-reflow="exitReflowMode"
          @reflowed="cacheReflowPage"
          @source-previous="reflowSourcePreviousPage"
          @source-next="reflowSourceNextPage"
        />
        <reflowed-page
          v-if="prefetchReflowPage"
          class="reflow-prefetch"
          :page="prefetchReflowPage"
          :target-width="reflowTargetWidth"
          :options="reflowOptions"
          :cached-items="cachedReflowItems(prefetchReflowPage)"
          :cached-page-background="cachedReflowBackground(prefetchReflowPage)"
          :cache-key="reflowCacheKey"
          preload
          @reflowed="cacheReflowPage"
        />

        <div
          v-if="!reflowCropMode"
          @click="reflowPreviousPage"
          class="reflow-click-left"
        />
        <div
          v-if="!reflowCropMode"
          @click="reflowNextPage"
          class="reflow-click-right"
        />
        <div
          v-if="!reflowCropMode"
          @click="toggleToolbars()"
          class="reflow-click-center"
        />
      </div>

      <continuous-reader
        v-else-if="continuousReader"
        :pages="pages"
        :page.sync="page"
        :animations="animations"
        :scale="continuousScale"
        :sidePadding="sidePadding"
        :page-margin="pageMargin"
        @menu="toggleToolbars()"
        @jump-previous="jumpToPrevious()"
        @jump-next="jumpToNext()"
      ></continuous-reader>

      <paged-reader
        v-else
        :pages="pages"
        :page.sync="page"
        :reading-direction="readingDirection"
        :page-layout="pageLayout"
        :scale="scale"
        :animations="animations"
        :swipe="swipe"
        @menu="toggleToolbars()"
        @jump-previous="jumpToPrevious()"
        @jump-next="jumpToNext()"
      ></paged-reader>
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

              <template v-if="isPdf">
                <v-subheader class="font-weight-black text-h6">Reflow</v-subheader>
                <v-list-item>
                  <settings-switch v-model="reflowMode" label="Reflow page"/>
                </v-list-item>
              </template>
              <template v-if="isPdf && reflowMode">
                <v-list-item>
                  <settings-switch v-model="reflowSettings.autoCropBorder" label="Auto crop borders"/>
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
import {bookPageUrl} from '@/functions/urls'
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
import {ContinuousScaleType, MarginValues, PaddingPercentage, PagedReaderLayout, ScaleType} from '@/types/enum-reader'
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
const REFLOW_CACHE_RADIUS = 4
const REFLOW_PREFETCH_DELAY_MS = 150

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
      reflowMode: false,
      k2ReflowMode: false,
      reflowStartAtEnd: false,
      k2ReflowStartAtEnd: false,
      reflowCropMode: false,
      reflowSettingsBookId: '',
      loadingReflowSettings: false,
      saveReflowSettingsServerDebounced: undefined as undefined | (() => void),
      reflowCache: {} as Record<string, any>,
      reflowPrefetchPage: 0,
      reflowPrefetchTimer: undefined as number | undefined,
      reflowSettings: {
        autoCropBorder: true,
        textScale: 75,
        columnCount: 1,
        threshold: 185,
        columnGap: 15,
        wordGap: 3,
        strokeStrength: 0.1,
        blockSpacing: 6,
        verticalText: false,
        verticalDirection: 'rtl',
        marginTop: 0,
        marginRight: 0,
        marginBottom: 0,
        marginLeft: 0,
        cropRoisByParity: {
          odd: null,
          even: null,
        },
        k2Settings: {
          textScale: 80,
          maxColumns: 2,
          threshold: 185,
          strokeStrength: 0.8,
          wordGap: 3,
          outputPadding: 16,
        },
      },
      goToPage: 1,
      settings: {
        pageLayout: PagedReaderLayout.SINGLE_PAGE,
        swipe: false,
        alwaysFullscreen: false,
        animations: true,
        scale: ScaleType.SCREEN,
        continuousScale: ContinuousScaleType.WIDTH,
        sidePadding: 0,
        pageMargin: 0,
        readingDirection: ReadingDirection.LEFT_TO_RIGHT,
        backgroundColor: 'black',
      },
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
      reflowColumnCounts: [
        {text: '1', value: 1},
        {text: '2', value: 2},
      ],
      reflowVerticalDirections: [
        {text: 'Right to left', value: 'rtl'},
        {text: 'Left to right', value: 'ltr'},
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
    this.saveReflowSettingsServerDebounced = debounce(() => this.saveReflowSettingsServer(), 700)
    window.addEventListener('keydown', this.keyPressed)
    if (screenfull.isEnabled) screenfull.on('change', this.fullscreenChanged)
  },
  async mounted() {
    document.documentElement.classList.add('html-reader')

    this.$debug('[mounted]', 'route.query:', this.$route.query)

    this.readingDirection = this.$store.state.persistedState.webreader.readingDirection
    this.animations = this.$store.state.persistedState.webreader.animations
    this.pageLayout = this.$store.state.persistedState.webreader.paged.pageLayout
    this.swipe = this.$store.state.persistedState.webreader.swipe
    this.alwaysFullscreen = this.$store.state.persistedState.webreader.alwaysFullscreen
    this.scale = this.$store.state.persistedState.webreader.paged.scale
    this.continuousScale = this.$store.state.persistedState.webreader.continuous.scale
    this.sidePadding = this.$store.state.persistedState.webreader.continuous.padding
    this.pageMargin = this.$store.state.persistedState.webreader.continuous.margin
    this.backgroundColor = this.$store.state.persistedState.webreader.background
    this.reflowSettingsBookId = this.bookId
    this.loadReflowSettings(this.bookId)

    this.setup(this.bookId, Number(this.$route.query.page))
  },
  destroyed() {
    document.documentElement.classList.remove('html-reader')
    this.clearReflowPrefetch()

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
      return this.book.media?.mediaType === 'application/pdf'
    },
    pdfTocFlattened(): TocEntry[] {
      return flattenToc(this.pdfToc, 1)
    },
    nightDisplay(): boolean {
      return this.backgroundColor === 'black'
    },
    reflowTargetWidth(): number {
      return this.$vuetify.breakpoint.width
    },
    reflowOptions(): object {
      return this.reflowSettings
    },
    reflowCacheKey(): string {
      return JSON.stringify({
        bookId: this.bookId,
        width: this.reflowTargetWidth,
        autoCropBorder: this.reflowSettings.autoCropBorder,
        textScale: this.reflowSettings.textScale,
        columnCount: this.reflowSettings.columnCount,
        threshold: this.reflowSettings.threshold,
        columnGap: this.reflowSettings.columnGap,
        wordGap: this.reflowSettings.wordGap,
        strokeStrength: this.reflowSettings.strokeStrength,
        verticalText: this.reflowSettings.verticalText,
        verticalDirection: this.reflowSettings.verticalDirection,
        marginTop: this.reflowSettings.marginTop,
        marginRight: this.reflowSettings.marginRight,
        marginBottom: this.reflowSettings.marginBottom,
        marginLeft: this.reflowSettings.marginLeft,
        cropRoisByParity: this.reflowSettings.cropRoisByParity,
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
        const serverSettings = this.readServerReflowSettings()[bookId]
        const raw = serverSettings ? JSON.stringify(serverSettings) : window.localStorage.getItem(this.reflowSettingsStorageKey(bookId))
        if (raw) Object.assign(this.reflowSettings, this.normalizedReflowSettings(JSON.parse(raw)))
      } catch (e) {
        this.$debug('Unable to load PDF reflow settings', e)
      } finally {
        this.$nextTick(() => this.loadingReflowSettings = false)
      }
    },
    saveReflowSettings() {
      if (!this.bookId) return
      try {
        window.localStorage.setItem(this.reflowSettingsStorageKey(), JSON.stringify(this.reflowSettings))
      } catch (e) {
        this.$debug('Unable to save PDF reflow settings', e)
      }
      this.saveReflowSettingsServerDebounced?.()
    },
    async saveReflowSettingsServer() {
      const bookId = this.reflowSettingsBookId || this.bookId
      if (!bookId) return
      try {
        const all = this.readServerReflowSettings()
        all[bookId] = this.normalizedReflowSettings(this.reflowSettings)
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
        autoCropBorder: typeof settings.autoCropBorder === 'boolean' ? settings.autoCropBorder : this.reflowSettings.autoCropBorder,
        textScale: this.clampReflowNumber(settings.textScale, 10, 140, this.reflowSettings.textScale),
        columnCount: Number(settings.columnCount) === 2 ? 2 : 1,
        threshold: this.clampReflowNumber(settings.threshold, 50, 230, this.reflowSettings.threshold),
        columnGap: this.clampReflowNumber(settings.columnGap, 5, 80, this.reflowSettings.columnGap),
        wordGap: this.clampReflowNumber(settings.wordGap, 1, 30, this.reflowSettings.wordGap),
        strokeStrength: Math.round(this.clampReflowNumber(settings.strokeStrength, 0.1, 3, this.reflowSettings.strokeStrength) * 10) / 10,
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
        maxColumns: Number(settings.maxColumns) === 1 ? 1 : 2,
        threshold: this.clampReflowNumber(settings.threshold, 50, 230, this.reflowSettings.k2Settings.threshold),
        strokeStrength: Math.round(this.clampReflowNumber(settings.strokeStrength, 0, 3, this.reflowSettings.k2Settings.strokeStrength) * 10) / 10,
        wordGap: Math.round(this.clampReflowNumber(settings.wordGap, 1, 30, this.reflowSettings.k2Settings.wordGap)),
        outputPadding: Math.round(this.clampReflowNumber(settings.outputPadding, 0, 48, this.reflowSettings.k2Settings.outputPadding)),
      }
    },
    normalizedReflowCropRois(cropRoisByParity: any): Record<string, any> {
      return {
        odd: this.normalizedReflowCropRoi(cropRoisByParity?.odd),
        even: this.normalizedReflowCropRoi(cropRoisByParity?.even),
      }
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

      this.reflowMode = true
      this.k2ReflowMode = false
      this.reflowStartAtEnd = false
      this.reflowCropMode = false
      this.clearReflowPrefetch()
    },
    exitReflowMode() {
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
    setReflowColumnCount(columnCount: number) {
      this.reflowSettings.columnCount = columnCount === 2 ? 2 : 1
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
    cacheReflowPage(payload: {pageNumber: number, cacheKey: string, items: any[], pageBackground?: string}) {
      if (payload.cacheKey !== this.reflowCacheKey) return
      this.$set(this.reflowCache, this.reflowCacheEntryKey(payload.pageNumber, payload.cacheKey), {
        items: payload.items,
        pageBackground: payload.pageBackground || '',
      })
      this.pruneReflowCache()
      if (payload.pageNumber === this.page) this.scheduleNextReflowPrefetch()
    },
    cacheCurrentReflowPage() {
      const reflow = this.$refs.reflowedPage as any
      const payload = reflow?.currentCachePayload?.()
      if (payload) this.cacheReflowPage(payload)
    },
    reflowCacheEntryKey(pageNumber: number, cacheKey: string): string {
      return `${pageNumber}|${cacheKey}`
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
      this.reflowPrefetchPage = 0
    },
    scheduleNextReflowPrefetch() {
      this.clearReflowPrefetch()
      if (!this.nextReflowPage || this.reflowCropMode) return
      this.reflowPrefetchTimer = window.setTimeout(() => {
        this.reflowPrefetchTimer = undefined
        if (this.nextReflowPage && !this.reflowCropMode) this.reflowPrefetchPage = this.nextReflowPage.number
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
</style>
<style>
.html-reader::-webkit-scrollbar {
  display: none;
}

.html-reader {
  scrollbar-width: none;
  overscroll-behavior: none;
}

.reader-night-mode .reader-frame img:not(.word-block):not(.k2-word),
.reader-night-mode .reader-frame canvas {
  filter: invert(1) hue-rotate(180deg) brightness(0.92);
}

.reader-night-mode .reader-frame img.word-block,
.reader-night-mode .reader-frame img.k2-word {
  filter: none;
}

</style>
