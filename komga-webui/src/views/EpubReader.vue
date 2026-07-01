<template>
  <div id="root" :key="bookId">
    <v-slide-y-transition>
      <v-toolbar
        v-if="showToolbars"
        dense elevation="1"
        class="settings full-width"
        style="position: fixed; top: 0;z-index: 14"
      >
        <v-btn
          icon
          @click="closeBook"
        >
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>

        <v-btn
          :disabled="!hasToc && !hasLandmarks && !hasPageList"
          icon
          @click="showToc = !showToc">
          <v-icon>mdi-table-of-contents</v-icon>
        </v-btn>

        <v-toolbar-title> {{ bookTitle }}</v-toolbar-title>
        <v-spacer></v-spacer>

        <v-btn
          icon
          :disabled="!screenfull.isEnabled"
          @click="screenfull.isFullscreen ? screenfull.exit() : enterFullscreen()">
          <v-icon>{{ fullscreenIcon }}</v-icon>
        </v-btn>

        <v-btn
          icon
          @click="showHelp = !showHelp">
          <v-icon>mdi-help-circle</v-icon>
        </v-btn>

        <v-btn
          icon
          @click="toggleSettings"
        >
          <v-icon>mdi-cog</v-icon>
        </v-btn>
      </v-toolbar>
    </v-slide-y-transition>

    <v-slide-y-reverse-transition>
      <!-- Bottom Toolbar-->
      <v-toolbar
        dense
        elevation="1"
        class="settings full-width"
        style="position: fixed; bottom: 0;z-index: 14"
        horizontal
        v-if="showToolbars"
      >
        <v-btn icon @click="previousBook">
          <v-icon>mdi-undo</v-icon>
        </v-btn>

        <v-spacer/>

        <v-btn
          icon
          :disabled="!historyCanGoBack"
          @click="historyBack"
        >
          <v-icon>mdi-chevron-left</v-icon>
        </v-btn>

        <span v-if="verticalScroll" class="mx-2" style="font-size: 0.85em">
          {{ progressionTotalPercentage }}
        </span>

        <v-btn
          icon
          :disabled="!historyCanGoForward"
          @click="historyForward"
        >
          <v-icon>mdi-chevron-right</v-icon>
        </v-btn>

        <v-spacer/>

        <v-btn icon @click="nextBook">
          <v-icon>mdi-redo</v-icon>
        </v-btn>
      </v-toolbar>
    </v-slide-y-reverse-transition>

    <v-navigation-drawer
      v-model="showToc"
      fixed
      temporary

      :width="$vuetify.breakpoint.smAndUp ? 500 : $vuetify.breakpoint.width - 50"
      style="z-index: 15"
    >
      <v-tabs grow>
        <v-tab v-if="hasToc">
          <v-icon>mdi-table-of-contents</v-icon>
        </v-tab>
        <v-tab v-if="hasLandmarks">
          <v-icon>mdi-eiffel-tower</v-icon>
        </v-tab>
        <v-tab v-if="hasPageList">
          <v-icon>mdi-numeric</v-icon>
        </v-tab>

        <v-tab-item v-if="hasToc" class="scrolltab">
          <toc-list :toc="tableOfContents" @goto="goToEntry" class="scrolltab-content"/>
        </v-tab-item>
        <v-tab-item v-if="hasLandmarks" class="scrolltab">
          <toc-list :toc="landmarks" @goto="goToEntry" class="scrolltab-content"/>
        </v-tab-item>
        <v-tab-item v-if="hasPageList" class="scrolltab">
          <toc-list :toc="pageList" @goto="goToEntry" class="scrolltab-content"/>
        </v-tab-item>
      </v-tabs>
    </v-navigation-drawer>

    <header id="headerMenu"/>

    <div id="D2Reader-Container" :style="epubReaderBackgroundStyle" :class="appearanceClass('bg')">
      <main tabindex=-1 id="iframe-wrapper" style="height: 100vh" @click="clickThrough">
        <div id="reader-loading"></div>
        <div id="reader-error"></div>
      </main>
      <a id="previous-chapter" rel="prev" role="button" aria-labelledby="previous-label"
         style="left: 50%;position: fixed;color: #000;height: 24px;background: #d3d3d33b; width: 150px;transform: translate(-50%, 0); display: block"
         :style="`top: ${showToolbars ? 48 : 0}px`"
         :class="settings.navigationButtons ? '' : 'hidden'"
         @click.capture="previousEpubPageControl"
      >
        <v-icon style="left: calc(50% - 12px); position: relative;">mdi-chevron-up</v-icon>
      </a>
      <a id="next-chapter" rel="next" role="button" aria-labelledby="next-label"
         :class="settings.navigationButtons ? '' : 'hidden'"
         style="bottom: 0;left: 50%;position: fixed;color: #000;height: 24px;background: #d3d3d33b; width: 150px;transform: translate(-50%, 0); display: block"
         @click.capture="nextEpubPageControl"
      >
        <v-icon style="left: calc(50% - 12px);position: relative;">mdi-chevron-down</v-icon>
      </a>
    </div>

    <footer id="footerMenu">
      <a rel="prev" class="disabled" role="button" aria-labelledby="previous-label"
         style="top: 50%;left:0;position: fixed;height: 100px;background: #d3d3d33b;"
         :class="settings.navigationButtons ? '' : 'hidden'"
         @click.capture="previousEpubPageControl"
      >
        <v-icon style="top: calc(50% - 12px);
                        position: relative;">mdi-chevron-left
        </v-icon>
      </a>
      <a rel="next" class="disabled" role="button" aria-labelledby="next-label"
         style="top: 50%;right:0;position: fixed;height: 100px;background: #d3d3d33b;"
         :class="settings.navigationButtons ? '' : 'hidden'"
         @click.capture="nextEpubPageControl"
      >
        <v-icon style="top: calc(50% - 12px);position: relative;">mdi-chevron-right</v-icon>
      </a>
    </footer>

    <v-container fluid class="full-width epub-status-bar"
                 :style="epubReaderStatusStyle"
                 :class="appearanceClass()"
                 v-if="!verticalScroll"
    >
      <v-row>
        <v-col cols="10" class="text-truncate">
          {{ $t('epubreader.page_of', {page: progressionPage, count: progressionPageCount}) }}
          ({{ progressionTitle || $t('epubreader.current_chapter') }})
        </v-col>
        <v-spacer/>
        <v-col cols="auto">{{ progressionTotalPercentage }}</v-col>
      </v-row>
    </v-container>

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
            <v-list-item v-if="fixedLayout">
              <settings-select
                :items="readingDirs"
                v-model="readingDirection"
                :label="$t('bookreader.settings.reading_mode')"
              />
            </v-list-item>
            <v-list-item>
              <settings-switch v-model="alwaysFullscreen" :label="$t('bookreader.settings.always_fullscreen')"
                               :disabled="!screenfull.isEnabled"/>
            </v-list-item>

            <v-list-item>
              <settings-select
                :items="navigationOptions"
                v-model="navigationMode"
                :label="$t('epubreader.settings.navigation_mode')"
              />
            </v-list-item>

            <v-list-item>
              <settings-select
                :items="epubVerticalSwipeLeftOptions"
                v-model="epubVerticalSwipeLeftAction"
                :label="$t('epubreader.settings.vertical_swipe_left_action')"
              />
            </v-list-item>

            <v-subheader class="font-weight-black text-h6">{{ $t('bookreader.settings.display') }}</v-subheader>

            <v-list-item v-if="fontFamilies.length > 1">
              <settings-select
                :items="fontFamilies"
                v-model="fontFamily"
                :label="$t('epubreader.settings.font_family')"
              />
            </v-list-item>

            <v-list-item>
              <v-list-item-title>{{ $t('epubreader.settings.viewing_theme') }}</v-list-item-title>
              <v-btn
                v-for="(a, i) in appearances"
                :key="i"
                :value="a.value"
                :color="a.color"
                :class="a.class"
                class="mx-1"
                @click="appearance = a.value"
              >
                <v-icon v-if="appearance === a.value">mdi-check</v-icon>
              </v-btn>
            </v-list-item>

            <v-list-item v-if="!fixedLayout">
              <v-list-item-title>{{ $t('epubreader.settings.layout') }}</v-list-item-title>
              <v-btn-toggle mandatory v-model="verticalScroll" class="py-3">
                <v-btn :value="true">{{ $t('epubreader.settings.layout_scroll') }}</v-btn>
                <v-btn :value="false">{{ $t('epubreader.settings.layout_paginated') }}</v-btn>
              </v-btn-toggle>
            </v-list-item>

            <v-list-item v-if="!verticalScroll">
              <v-list-item-title>{{ $t('epubreader.settings.column_count') }}</v-list-item-title>
              <v-btn-toggle mandatory v-model="columnCount" class="py-3">
                <v-btn v-for="(c, i) in columnCounts" :key="i" :value="c.value">{{ c.text }}</v-btn>
              </v-btn-toggle>
            </v-list-item>

            <v-list-item class="justify-center">
              <v-btn depressed @click="fontSize-=10">
                <v-icon small>mdi-format-title</v-icon>
              </v-btn>
              <span class="caption mx-8" style="width: 2rem">{{ fontSize }}%</span>
              <v-btn depressed @click="fontSize+=10">
                <v-icon>mdi-format-title</v-icon>
              </v-btn>
            </v-list-item>

            <v-list-item class="justify-center">
              <v-btn depressed @click="lineHeight-=.1">
                <v-icon>$formatLineSpacingDown</v-icon>
              </v-btn>
              <span class="caption mx-8" style="width: 2rem">{{ Math.round(lineHeight * 100) }}%</span>
              <v-btn depressed @click="lineHeight+=.1">
                <v-icon>mdi-format-line-spacing</v-icon>
              </v-btn>
            </v-list-item>

            <v-list-item>
              <v-slider
                v-model="pageMargins"
                :label="$t('epubreader.settings.page_margins')"
                min="0.5"
                max="4"
                step="0.25"
                ticks="always"
                tick-size="3"
              />
            </v-list-item>

            <v-list-item>
              <settings-switch
                v-model="epubBackgroundImagesEnabled"
                :label="$t('epubreader.settings.background_images_enabled')"
              />
            </v-list-item>

            <v-list-item v-if="epubBackgroundImagesEnabled">
              <settings-select
                :items="epubBackgroundImageLightItems"
                v-model="epubBackgroundImageLightId"
                :label="$t('epubreader.settings.background_image_light')"
              />
            </v-list-item>

            <v-list-item v-if="epubBackgroundImagesEnabled">
              <v-file-input
                v-model="epubBackgroundImageLightFile"
                accept="image/*"
                prepend-icon="mdi-image-outline"
                show-size
                hide-details
                :label="$t('epubreader.settings.background_image_light_upload')"
                @change="setEpubBackgroundImage('light', $event)"
              />
              <v-btn
                icon
                :aria-label="$t('epubreader.settings.background_image_delete')"
                :disabled="!epubBackgroundImageLightId"
                @click="deleteEpubBackgroundImage('light')"
              >
                <v-icon>mdi-delete</v-icon>
              </v-btn>
            </v-list-item>

            <v-list-item v-if="epubBackgroundImagesEnabled">
              <settings-select
                :items="epubBackgroundImageDarkItems"
                v-model="epubBackgroundImageDarkId"
                :label="$t('epubreader.settings.background_image_dark')"
              />
            </v-list-item>

            <v-list-item v-if="epubBackgroundImagesEnabled">
              <v-file-input
                v-model="epubBackgroundImageDarkFile"
                accept="image/*"
                prepend-icon="mdi-image-outline"
                show-size
                hide-details
                :label="$t('epubreader.settings.background_image_dark_upload')"
                @change="setEpubBackgroundImage('dark', $event)"
              />
              <v-btn
                icon
                :aria-label="$t('epubreader.settings.background_image_delete')"
                :disabled="!epubBackgroundImageDarkId"
                @click="deleteEpubBackgroundImage('dark')"
              >
                <v-icon>mdi-delete</v-icon>
              </v-btn>
            </v-list-item>

            <v-divider/>
            <v-subheader class="font-weight-black text-h6">{{ $t('epubreader.settings.custom_style') }}</v-subheader>

            <v-list-item>
              <settings-switch
                v-model="epubCustomStyleEnabled"
                :label="$t('epubreader.settings.custom_style_enabled')"
              />
            </v-list-item>

            <v-list-item>
              <settings-switch
                v-model="epubCustomStyleDisableOriginalStyle"
                :label="$t('epubreader.settings.custom_style_disable_original')"
              />
            </v-list-item>

            <v-list-item>
              <settings-select
                :items="epubChineseConversionOptions"
                v-model="epubCustomStyleChineseConversion"
                :label="$t('epubreader.settings.chinese_conversion')"
              />
            </v-list-item>

            <v-list-item>
              <v-textarea
                v-model="epubCustomStyleCss"
                :label="$t('epubreader.settings.custom_style_css')"
                auto-grow
                outlined
                rows="6"
                spellcheck="false"
                class="epub-custom-style-editor"
              />
            </v-list-item>

            <v-list-item class="justify-end">
              <v-btn
                color="primary"
                depressed
                :loading="epubCustomStyleSaving"
                @click="saveEpubCustomStyle"
              >
                {{ $t('epubreader.settings.custom_style_save') }}
              </v-btn>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </v-bottom-sheet>

    <v-snackbar
      v-model="notification.enabled"
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
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import D2Reader, {Locator} from '@d-i-t-a/reader'
import urls, {bookManifestUrl, bookPositionsUrl} from '@/functions/urls'
import {BookDto} from '@/types/komga-books'
import {getBookTitleCompact} from '@/functions/book-title'
import {SeriesDto} from '@/types/komga-series'
import {Context, ContextOrigin} from '@/types/context'
import SettingsSwitch from '@/components/SettingsSwitch.vue'
import {TocEntry} from '@/types/epub'
import TocList from '@/components/TocList.vue'
import {Locations} from '@d-i-t-a/reader/dist/types/model/Locator'
import {
  epubShortcutsMenus,
  epubShortcutsSettings,
  epubShortcutsSettingsScroll,
  shortcutsD2Reader,
  shortcutsD2ReaderLTR,
  shortcutsD2ReaderRTL,
} from '@/functions/shortcuts/epubreader'
import {flattenToc} from '@/functions/toc'
import ShortcutHelpDialog from '@/components/dialogs/ShortcutHelpDialog.vue'
import screenfull from 'screenfull'
import {getBookReadRouteFromMedia} from '@/functions/book-format'
import SettingsSelect from '@/components/SettingsSelect.vue'
import {createR2Progression, r2ProgressionToReadingPosition} from '@/functions/readium'
import {debounce} from 'lodash'
import OpenCC, {ConverterFunction} from 'opencc-js'
import {
  CLIENT_SETTING,
  ClientSettingUserUpdateDto,
  ClientSettingsEpubBackgroundImage,
  ClientSettingsEpubBackgroundImages,
  ClientSettingsEpubBackgroundImageSelection,
  ClientSettingsEpubChineseConversion,
  ClientSettingsEpubCustomStyle,
} from '@/types/komga-clientsettings'

const EPUB_CUSTOM_STYLE_WINDOW_KEY = '__KOMGA_EPUB_CUSTOM_STYLE__'
const EPUB_CUSTOM_STYLE_ID = 'komga-epub-custom-style'
const EPUB_AUTHOR_STYLE_DISABLED_ATTR = 'komgaAuthorStyleDisabled'
const EPUB_AUTHOR_STYLE_ORIGINAL_MEDIA_ATTR = 'komgaOriginalMedia'
const EPUB_AUTHOR_INLINE_STYLE_DISABLED_ATTR = 'komgaAuthorInlineStyleDisabled'
const EPUB_AUTHOR_ORIGINAL_INLINE_STYLE_ATTR = 'komgaOriginalInlineStyle'
const EPUB_AUTHOR_IMAGE_SIZE_DISABLED_ATTR = 'komgaAuthorImageSizeDisabled'
const EPUB_AUTHOR_ORIGINAL_WIDTH_ATTR = 'komgaOriginalWidth'
const EPUB_AUTHOR_ORIGINAL_HEIGHT_ATTR = 'komgaOriginalHeight'
const EPUB_VERTICAL_PAGE_MASK_ID = 'komga-epub-vertical-page-mask'
const EPUB_CHINESE_TEXT_ORIGINALS = new WeakMap<Text, string>()
const EPUB_CHINESE_CONVERTERS = {} as Partial<Record<Exclude<ClientSettingsEpubChineseConversion, 'none'>, ConverterFunction>>
const EPUB_CHINESE_TEXT_PATTERN = /[\u3400-\u9fff\uf900-\ufaff]/
const EPUB_HORIZONTAL_SWIPE_MIN_DISTANCE = 48
const EPUB_HORIZONTAL_SWIPE_DOMINANCE_RATIO = 1.25
const EPUB_BACKGROUND_IMAGE_MAX_BYTES = 2 * 1024 * 1024
const EPUB_AUTHOR_INLINE_STYLE_PROPERTIES = [
  'font-size',
  'font-family',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'color',
  'background',
  'background-color',
]
const EPUB_CHINESE_CONVERSION_SKIP_SELECTOR = [
  'script',
  'style',
  'textarea',
  'input',
  'select',
  'option',
  'code',
  'pre',
  'kbd',
  'samp',
  'svg',
  'math',
  '.ignore-opencc',
].join(',')
const READIUM_CSS_BEFORE_URL = new URL('../styles/readium/ReadiumCSS-before.css.resource', import.meta.url).toString()
const READIUM_CSS_DEFAULT_URL = new URL('../styles/readium/ReadiumCSS-default.css.resource', import.meta.url).toString()
const READIUM_CSS_AFTER_URL = new URL('../styles/readium/ReadiumCSS-after.css.resource', import.meta.url).toString()
const R2D2BC_POPUP_CSS_URL = new URL('../styles/r2d2bc/popup.css.resource', import.meta.url).toString()
const R2D2BC_POPOVER_CSS_URL = new URL('../styles/r2d2bc/popover.css.resource', import.meta.url).toString()
const R2D2BC_STYLE_CSS_URL = new URL('../styles/r2d2bc/style.css.resource', import.meta.url).toString()
const EPUB_READER_STYLE_URLS = [
  READIUM_CSS_BEFORE_URL,
  READIUM_CSS_DEFAULT_URL,
  READIUM_CSS_AFTER_URL,
  R2D2BC_POPUP_CSS_URL,
  R2D2BC_POPOVER_CSS_URL,
  R2D2BC_STYLE_CSS_URL,
]
const createEmptyEpubBackgroundImages = (): ClientSettingsEpubBackgroundImages => ({
  enabled: false,
  selectedLightId: '',
  selectedDarkId: '',
  light: [],
  dark: [],
  books: {},
})

const createEmptyEpubBackgroundImageSelection = (): ClientSettingsEpubBackgroundImageSelection => ({
  enabled: false,
  selectedLightId: '',
  selectedDarkId: '',
})

type EpubTouchStart = {
  x: number,
  y: number,
}

type EpubPageAction = 'next' | 'previous'
type EpubBackgroundImageMode = 'light' | 'dark'

type EpubReadingOrderItem = {
  href?: string,
  Href?: string,
  title?: string,
  Title?: string,
  type?: string,
  TypeLink?: string,
}

type EpubPublication = {
  getAbsoluteHref: (href: string) => string,
  getPreviousSpineItem: (href: string) => EpubReadingOrderItem | undefined,
  getNextSpineItem: (href: string) => EpubReadingOrderItem | undefined,
}

type EpubNavigator = {
  publication?: EpubPublication,
  currentChapterLink?: {
    href?: string,
  },
}

export default Vue.extend({
  name: 'EpubReader',
  components: {SettingsSelect, ShortcutHelpDialog, TocList, SettingsSwitch},
  data: function () {
    return {
      screenfull,
      fullscreenIcon: 'mdi-fullscreen',
      d2Reader: {} as D2Reader,
      book: undefined as unknown as BookDto,
      series: undefined as unknown as SeriesDto,
      siblingPrevious: {} as BookDto,
      siblingNext: {} as BookDto,
      incognito: false,
      context: {} as Context,
      contextName: '',
      showSettings: false,
      showToolbars: false,
      showToc: false,
      showHelp: false,
      readingDirs: [
        {
          text: this.$t('enums.epubreader.reading_direction.auto').toString(),
          value: 'auto',
        },
        {
          text: this.$t('enums.epubreader.reading_direction.ltr').toString(),
          value: 'ltr',
        },
        {
          text: this.$t('enums.epubreader.reading_direction.rtl').toString(),
          value: 'rtl',
        },
      ],
      appearances: [
        {
          text: this.$t('enums.epubreader.appearances.day').toString(),
          value: 'readium-default-on',
          color: 'white',
          class: 'black--text',
        },
        {
          text: this.$t('enums.epubreader.appearances.sepia').toString(),
          value: 'readium-sepia-on',
          color: '#faf4e8',
          class: 'black--text',
        },
        {
          text: this.$t('enums.epubreader.appearances.green').toString(),
          value: 'readium-green-on',
          color: '#c7edcc',
          class: 'black--text',
        },
        {
          text: this.$t('enums.epubreader.appearances.night').toString(),
          value: 'readium-night-on',
          color: 'black',
          class: 'white--text',
        },
      ],
      columnCounts: [
        {text: this.$t('enums.epubreader.column_count.auto').toString(), value: 'auto'},
        {text: this.$t('enums.epubreader.column_count.one').toString(), value: '1'},
        {text: this.$t('enums.epubreader.column_count.two').toString(), value: '2'},
      ],
      fontFamilyDefault: [{
        text: this.$t('epubreader.publisher_font'),
        value: 'Original',
      }],
      fontFamiliesAdditional: [] as string[],
      fontFamilies: [] as any[],
      settings: {
        // R2D2BC
        appearance: 'readium-default-on',
        pageMargins: 1,
        lineHeight: 1,
        fontSize: 100,
        verticalScroll: false,
        columnCount: 'auto',
        fixedLayoutMargin: 0,
        fixedLayoutShadow: false,
        direction: 'auto',
        fontFamily: 'Original',
        // Epub Reader
        alwaysFullscreen: false,
        navigationClick: true,
        navigationButtons: true,
        verticalSwipeLeftAction: 'previous' as EpubPageAction,
        // legacy local values, migrated to WEBUI_EPUB_BACKGROUND_IMAGES when present
        backgroundImageLight: '',
        backgroundImageDark: '',
      },
      epubBackgroundImageLightFile: undefined as File | undefined,
      epubBackgroundImageDarkFile: undefined as File | undefined,
      epubBackgroundImages: createEmptyEpubBackgroundImages(),
      navigationOptions: [
        {text: this.$t('epubreader.settings.navigation_options.buttons').toString(), value: 'button'},
        {text: this.$t('epubreader.settings.navigation_options.click').toString(), value: 'click'},
        {text: this.$t('epubreader.settings.navigation_options.both').toString(), value: 'buttonclick'},
      ],
      epubVerticalSwipeLeftOptions: [
        {text: this.$t('epubreader.settings.vertical_swipe_left_options.previous').toString(), value: 'previous'},
        {text: this.$t('epubreader.settings.vertical_swipe_left_options.next').toString(), value: 'next'},
      ],
      epubChineseConversionOptions: [
        {text: this.$t('epubreader.settings.chinese_conversion_none').toString(), value: 'none'},
        {text: this.$t('epubreader.settings.chinese_conversion_simplified').toString(), value: 'simplified'},
        {text: this.$t('epubreader.settings.chinese_conversion_traditional').toString(), value: 'traditional'},
      ],
      tocs: {
        toc: undefined as unknown as TocEntry[],
        landmarks: undefined as unknown as TocEntry[],
        pageList: undefined as unknown as TocEntry[],
      },
      currentLocation: undefined as unknown as Locator,
      historyCanGoBack: false,
      historyCanGoForward: false,
      notification: {
        enabled: false,
        message: '',
        timeout: 4000,
      },
      clickTimer: undefined,
      forceUpdate: false,
      progressionTitle: undefined as string,
      progressionPage: undefined as number,
      progressionPageCount: undefined as number,
      effectiveDirection: 'ltr',
      fixedLayout: false,
      epubCustomStyleEnabled: false,
      epubCustomStyleDisableOriginalStyle: false,
      epubCustomStyleChineseConversion: 'none' as ClientSettingsEpubChineseConversion,
      epubCustomStyleCss: '',
      epubCustomStyleSaving: false,
      epubIframeEnhancementObserver: undefined as MutationObserver | undefined,
      epubIframeEnhancementTimers: [] as number[],
      epubTouchStart: undefined as EpubTouchStart | undefined,
      pendingVerticalEpubResourceEdge: undefined as 'start' | 'end' | undefined,
    }
  },
  created() {
    this.$vuetify.rtl = false
    if (screenfull.isEnabled) screenfull.on('change', this.fullscreenChanged)
  },
  beforeDestroy() {
    this.stopEpubIframeEnhancements()
    this.d2Reader?.stop?.()
  },
  destroyed() {
    delete (window as any)[EPUB_CUSTOM_STYLE_WINDOW_KEY]
    this.$vuetify.rtl = (this.$t('common.locale_rtl') === 'true')
    if (screenfull.isEnabled) {
      screenfull.off('change', this.fullscreenChanged)
      screenfull.exit()
    }
  },
  async mounted() {
    Object.assign(this.settings, this.$store.state.persistedState.epubreader)
    this.settings.alwaysFullscreen = this.$store.state.persistedState.webreader.alwaysFullscreen

    this.fontFamiliesAdditional = await this.$komgaFonts.getFamilies()
    this.fontFamilies = [...this.fontFamilyDefault, ...this.fontFamiliesAdditional]

    this.setup(this.bookId)
  },
  props: {
    bookId: {
      type: String,
      required: true,
    },
  },
  beforeRouteUpdate(to, from, next) {
    if (to.params.bookId !== from.params.bookId) {
      // route update means either:
      // - going to previous/next book, in this case the query.page is not set, so it will default to first page
      // - pressing the back button of the browser and navigating to the previous book, in this case the query.page is set, so we honor it
      this.stopEpubIframeEnhancements()
      this.d2Reader?.stop?.()
      this.setup(to.params.bookId, Number(to.query.page))
    }
    next()
  },
  computed: {
    isRtl(): boolean {
      return this.effectiveDirection === 'rtl'
    },
    shortcuts(): any {
      const shortcuts = [...epubShortcutsSettings, ...epubShortcutsMenus]
      if (!this.fixedLayout) shortcuts.push(...epubShortcutsSettingsScroll)
      return this.$_.keyBy(shortcuts, x => x.key)
    },
    progressionTotalPercentage(): string {
      const p = this.currentLocation?.locations?.totalProgression
      if (p) return `${Math.round(p * 100)}%`
      return ''
    },
    epubReaderBackgroundStyle(): Record<string, string> {
      const style = {
        height: '100vh',
        backgroundColor: this.getEpubThemeBackgroundColor(),
      } as Record<string, string>
      const image = this.getCurrentEpubBackgroundImage()
      if (image) {
        style.backgroundImage = this.toCssUrl(image)
        style.backgroundSize = 'cover'
        style.backgroundPosition = 'center'
        style.backgroundRepeat = 'no-repeat'
        style.backgroundAttachment = 'fixed'
      }
      return style
    },
    epubReaderStatusStyle(): Record<string, string> {
      const style = {
        position: 'fixed',
        bottom: '0',
        fontSize: '.85rem',
        backgroundColor: this.getEpubThemeBackgroundColor(),
      } as Record<string, string>
      const image = this.getCurrentEpubBackgroundImage()
      if (image) {
        style.backgroundImage = this.toCssUrl(image)
        style.backgroundSize = 'cover'
        style.backgroundPosition = 'center'
        style.backgroundRepeat = 'no-repeat'
        style.backgroundAttachment = 'fixed'
      }
      return style
    },
    epubBackgroundImagesEnabled: {
      get: function (): boolean {
        return this.getCurrentEpubBackgroundImageSelection().enabled
      },
      set: function (enabled: boolean): void {
        this.setCurrentEpubBackgroundImageSelection({enabled})
        this.saveEpubBackgroundImages()
        this.scheduleEpubIframeEnhancements(false)
      },
    },
    epubBackgroundImageLightId: {
      get: function (): string {
        return this.getCurrentEpubBackgroundImageSelection().selectedLightId || ''
      },
      set: function (id: string): void {
        this.setCurrentEpubBackgroundImageSelection({selectedLightId: id})
        this.saveEpubBackgroundImages()
        this.scheduleEpubIframeEnhancements(false)
      },
    },
    epubBackgroundImageDarkId: {
      get: function (): string {
        return this.getCurrentEpubBackgroundImageSelection().selectedDarkId || ''
      },
      set: function (id: string): void {
        this.setCurrentEpubBackgroundImageSelection({selectedDarkId: id})
        this.saveEpubBackgroundImages()
        this.scheduleEpubIframeEnhancements(false)
      },
    },
    epubBackgroundImageLightItems(): { text: string, value: string }[] {
      return this.getEpubBackgroundImageItems('light')
    },
    epubBackgroundImageDarkItems(): { text: string, value: string }[] {
      return this.getEpubBackgroundImageItems('dark')
    },
    shortcutsHelp(): object {
      let nav = []
      if (this.effectiveDirection === 'rtl') nav.push(...shortcutsD2ReaderRTL)
      else nav.push(...shortcutsD2ReaderLTR)
      nav.push(...shortcutsD2Reader)
      return {
        [this.$t('bookreader.shortcuts.reader_navigation').toString()]: nav,
        [this.$t('bookreader.shortcuts.settings').toString()]: [...epubShortcutsSettings],
        [this.$t('bookreader.shortcuts.menus').toString()]: epubShortcutsMenus,
      }
    },
    tableOfContents(): TocEntry[] {
      if (this.tocs.toc) return flattenToc(this.tocs.toc, 1, 0, this.currentLocation?.href)
      return []
    },
    landmarks(): TocEntry[] {
      if (this.tocs.landmarks) return flattenToc(this.tocs.landmarks, 1, 0, this.currentLocation?.href)
      return []
    },
    pageList(): TocEntry[] {
      if (this.tocs.pageList) return flattenToc(this.tocs.pageList, 1, 0, this.currentLocation?.href)
      return []
    },
    hasToc(): boolean {
      return this.tocs.toc?.length > 0
    },
    hasLandmarks(): boolean {
      return this.tocs.landmarks?.length > 0
    },
    hasPageList(): boolean {
      return this.tocs.pageList?.length > 0
    },
    bookTitle(): string {
      if (!!this.book && !!this.series)
        return getBookTitleCompact(this.book.metadata.title, this.series.metadata.title, this.book.oneshot ? undefined : this.book.metadata.number)
      return this.book?.metadata?.title
    },
    appearance: {
      get: function (): string {
        return this.settings.appearance
      },
      set: function (color: string): void {
        if (this.appearances.map(x => x.value).includes(color)) {
          this.settings.appearance = color
          this.d2Reader.applyUserSettings({appearance: color})
          this.$store.commit('setEpubreaderSettings', this.settings)
          this.scheduleEpubIframeEnhancements(false)
        }
      },
    },
    verticalScroll: {
      get: function (): boolean {
        return this.settings.verticalScroll
      },
      set: function (value: string): void {
        this.settings.verticalScroll = value
        this.d2Reader.applyUserSettings({verticalScroll: value})
        this.$store.commit('setEpubreaderSettings', this.settings)
      },
    },
    columnCount: {
      get: function (): boolean {
        return this.settings.columnCount
      },
      set: function (value: string): void {
        if (this.columnCounts.map(x => x.value).includes(value)) {
          this.settings.columnCount = value
          this.d2Reader.applyUserSettings({columnCount: value})
          this.$store.commit('setEpubreaderSettings', this.settings)
        }
      },
    },
    readingDirection: {
      get: function (): boolean {
        return this.settings.direction
      },
      set: function (value: string): void {
        if (this.readingDirs.map(x => x.value).includes(value)) {
          this.settings.direction = value
          this.d2Reader.applyUserSettings({direction: value})
          this.$store.commit('setEpubreaderSettings', this.settings)
        }
      },
    },
    pageMargins: {
      get: function (): number {
        return this.settings.pageMargins
      },
      set: function (value: number): void {
        this.settings.pageMargins = value
        this.d2Reader.applyUserSettings({pageMargins: value})
        this.$store.commit('setEpubreaderSettings', this.settings)
      },
    },
    lineHeight: {
      get: function (): number {
        return this.settings.lineHeight
      },
      set: function (value: number): void {
        this.settings.lineHeight = value
        this.d2Reader.applyUserSettings({lineHeight: value})
        this.$store.commit('setEpubreaderSettings', this.settings)
      },
    },
    fontSize: {
      get: function (): number {
        return this.settings.fontSize
      },
      set: function (value: number): void {
        this.settings.fontSize = value
        this.d2Reader.applyUserSettings({fontSize: value})
        this.$store.commit('setEpubreaderSettings', this.settings)
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
    navigationMode: {
      get: function (): string {
        let r = this.settings.navigationButtons ? 'button' : ''
        if (this.settings.navigationClick) r += 'click'
        return r
      },
      set: function (value: string): void {
        this.settings.navigationButtons = value.includes('button')
        this.settings.navigationClick = value.includes('click')
        this.$store.commit('setEpubreaderSettings', this.settings)
      },
    },
    epubVerticalSwipeLeftAction: {
      get: function (): EpubPageAction {
        return this.settings.verticalSwipeLeftAction === 'next' ? 'next' : 'previous'
      },
      set: function (value: EpubPageAction): void {
        if (this.epubVerticalSwipeLeftOptions.map(x => x.value).includes(value)) {
          this.settings.verticalSwipeLeftAction = value
          this.$store.commit('setEpubreaderSettings', this.settings)
        }
      },
    },
    fontFamily: {
      get: function (): string {
        return this.settings.fontFamily ?? 'Original'
      },
      set: function (value: string): void {
        this.settings.fontFamily = value
        this.d2Reader.applyUserSettings({fontFamily: value})
        this.$store.commit('setEpubreaderSettings', this.settings)
      },
    },
  },
  methods: {
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
    enterFullscreen() {
      if (screenfull.isEnabled) screenfull.request(document.documentElement, {navigationUI: 'hide'})
    },
    switchFullscreen() {
      if (screenfull.isEnabled) screenfull.isFullscreen ? screenfull.exit() : this.enterFullscreen()
    },
    fullscreenChanged() {
      if (screenfull.isEnabled && screenfull.isFullscreen) this.fullscreenIcon = 'mdi-fullscreen-exit'
      else this.fullscreenIcon = 'mdi-fullscreen'
    },
    toggleToolbars() {
      this.showToolbars = !this.showToolbars
    },
    toggleSettings() {
      this.showSettings = !this.showSettings
    },
    toggleTableOfContents() {
      this.showToc = !this.showToc
    },
    toggleHelp() {
      this.showHelp = !this.showHelp
    },
    keyPressed(e: KeyboardEvent) {
      this.shortcuts[e.key]?.execute(this)
    },
    clickThrough(e: MouseEvent) {
      let x = e.x
      let y = e.y
      if (e.target.ownerDocument != document) {
        const iframe = e.view.frameElement
        const iframeWrapper = iframe.parentElement.parentElement
        const scaleComputed = iframeWrapper.getBoundingClientRect().width / iframeWrapper.offsetWidth
        const rect = iframe.getBoundingClientRect()
        x = rect.left + (e.x * scaleComputed)
        y = rect.top + (e.y * scaleComputed)
      }

      if (e.detail === 1) {
        this.clickTimer = setTimeout(() => {
          this.singleClick(x, y)
        }, 200)
      }
      if (e.detail === 2) {
        clearTimeout(this.clickTimer)
      }
    },
    singleClick(x: number, y: number) {
      if (this.verticalScroll) {
        if (this.settings.navigationClick) {
          if (y < this.$vuetify.breakpoint.height / 4) return this.d2Reader.previousPage()
          if (y > this.$vuetify.breakpoint.height * .75) return this.d2Reader.nextPage()
        }
      } else {
        if (this.settings.navigationClick) {
          if (x < this.$vuetify.breakpoint.width / 4) return this.isRtl ? this.nextEpubPage() : this.previousEpubPage()
          if (x > this.$vuetify.breakpoint.width * .75) return this.isRtl ? this.previousEpubPage() : this.nextEpubPage()
        }
      }
      this.toggleToolbars()
    },
    async setup(bookId: string) {
      this.book = await this.$komgaBooks.getBook(bookId)
      this.series = await this.$komgaSeries.getOneSeries(this.book.seriesId)
      await this.loadEpubCustomStyle(bookId)

      const progression = await this.$komgaBooks.getProgression(bookId)
      const initialLocation = r2ProgressionToReadingPosition(progression, bookId)

      // parse query params to get context and contextId
      if (this.$route.query.contextId && this.$route.query.context
        && Object.values(ContextOrigin).includes(this.$route.query.context as ContextOrigin)) {
        this.context = {
          origin: this.$route.query.context as ContextOrigin,
          id: this.$route.query.contextId as string,
        }
        this.book.context = this.context
        if (this?.context.origin === ContextOrigin.READLIST) {
          this.contextName = (await (this.$komgaReadLists.getOneReadList(this.context.id))).name
          document.title = `Komga - ${this.contextName} - ${this.book.metadata.title}`
        }
      } else {
        document.title = `Komga - ${this.bookTitle}`
      }

      // parse query params to get incognito mode
      this.incognito = !!(this.$route.query.incognito && this.$route.query.incognito.toString().toLowerCase() === 'true')

      const fontFamiliesInjectables = this.fontFamiliesAdditional.map(x => ({
        type: 'style',
        url: new URL(`${urls.origin}api/v1/fonts/resource/${x}/css`).toString(),
        fontFamily: x,
      }))

      this.d2Reader = await D2Reader.load({
        url: new URL(bookManifestUrl(bookId)),
        userSettings: this.settings,
        storageType: 'memory',
        lastReadingPosition: initialLocation,
        injectables: [
          // webpack will process the new URL (https://webpack.js.org/guides/asset-modules/#url-assets)
          // we use a different extension so that the css-loader rule is not used (see vue.config.js)
          {
            type: 'style',
            url: READIUM_CSS_BEFORE_URL,
            r2before: true,
          },
          {
            type: 'style',
            url: READIUM_CSS_DEFAULT_URL,
            r2default: true,
          },
          {
            type: 'style',
            url: READIUM_CSS_AFTER_URL,
            r2after: true,
          },
          {type: 'style', url: R2D2BC_POPUP_CSS_URL},
          {type: 'style', url: R2D2BC_POPOVER_CSS_URL},
          {type: 'style', url: R2D2BC_STYLE_CSS_URL},
          ...fontFamiliesInjectables,
        ],
        requestConfig: {
          credentials: 'include',
        },
        attributes: {
          margin: 0, // subtract this from the iframe height, when setting the iframe minimum height
          navHeight: 10, // used for positioning the toolbox
          iframePaddingTop: 20, // top padding inside iframe
          bottomInfoHeight: 35, // #reader-info-bottom height
        },
        rights: {
          enableBookmarks: false,
          enableAnnotations: false,
          enableTTS: false,
          enableSearch: false,
          enableTimeline: false,
          enableDefinitions: false,
          enableContentProtection: false,
          enableMediaOverlays: false,
          enablePageBreaks: false,
          autoGeneratePositions: false,
          enableLineFocus: false,
          customKeyboardEvents: false,
          enableHistory: true,
          enableCitations: false,
          enableConsumption: false,
        },
        services: {
          positions: new URL(bookPositionsUrl(bookId)),
        },
        api: {
          updateCurrentLocation: this.updateCurrentLocation,
          keydownFallthrough: this.keyPressed,
          clickThrough: this.clickThrough,
          positionInfo: this.updatePositionInfo,
          chapterInfo: this.updateChapterInfo,
          direction: this.updateDirection,
        },
      })

      this.fixedLayout = this.d2Reader.publicationLayout === 'fixed'

      this.tocs.toc = this.d2Reader.tableOfContents
      this.tocs.landmarks = this.d2Reader.landmarks
      this.tocs.pageList = this.d2Reader.pageList
      this.$nextTick(() => this.startEpubIframeEnhancements())

      if (this.alwaysFullscreen) this.enterFullscreen()

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
    historyBack() {
      this.d2Reader.historyBack()
    },
    historyForward() {
      this.d2Reader.historyForward()
    },
    updateCurrentLocation(location: Locator): Promise<Locator> {
      // handle history
      this.historyCanGoBack = this.d2Reader.historyCurrentIndex > 0
      this.historyCanGoForward = this.d2Reader.historyCurrentIndex < this.d2Reader.history?.length - 1

      this.markProgress(location)
      this.currentLocation = location
      this.scheduleEpubIframeEnhancements(false)
      return new Promise(function (resolve, _) {
        resolve(location)
      })
    },
    updatePositionInfo(location: Locator) {
      this.progressionPage = location.displayInfo?.resourceScreenIndex
      this.progressionPageCount = location.displayInfo?.resourceScreenCount
    },
    updateChapterInfo(title?: string) {
      this.progressionTitle = title
    },
    updateDirection(dir: string) {
      this.effectiveDirection = dir
    },
    loadEpubBackgroundImages() {
      this.epubBackgroundImages = this.normalizeEpubBackgroundImages(this.getEpubBackgroundImages())
    },
    getEpubBackgroundImages(): ClientSettingsEpubBackgroundImages {
      try {
        return JSON.parse(this.$store.state.komgaSettings.clientSettingsUser[CLIENT_SETTING.WEBUI_EPUB_BACKGROUND_IMAGES]?.value)
      } catch (e) {
        return createEmptyEpubBackgroundImages()
      }
    },
    normalizeEpubBackgroundImages(config?: Partial<ClientSettingsEpubBackgroundImages>): ClientSettingsEpubBackgroundImages {
      const light = Array.isArray(config?.light) ? config?.light.filter(this.isValidEpubBackgroundImage) || [] : []
      const dark = Array.isArray(config?.dark) ? config?.dark.filter(this.isValidEpubBackgroundImage) || [] : []
      const books =
        Object.entries(config?.books || {})
          .reduce((acc, [bookId, selection]) => {
            acc[bookId] = this.normalizeEpubBackgroundImageSelection(selection, light, dark)
            return acc
          }, {} as Record<string, ClientSettingsEpubBackgroundImageSelection>)

      return {
        enabled: false,
        selectedLightId: '',
        selectedDarkId: '',
        light,
        dark,
        books,
      }
    },
    normalizeEpubBackgroundImageSelection(
      selection: Partial<ClientSettingsEpubBackgroundImageSelection> | undefined,
      light: ClientSettingsEpubBackgroundImage[] = this.epubBackgroundImages.light,
      dark: ClientSettingsEpubBackgroundImage[] = this.epubBackgroundImages.dark,
    ): ClientSettingsEpubBackgroundImageSelection {
      return {
        enabled: selection?.enabled || false,
        selectedLightId: light.some(x => x.id === selection?.selectedLightId) ? selection?.selectedLightId : '',
        selectedDarkId: dark.some(x => x.id === selection?.selectedDarkId) ? selection?.selectedDarkId : '',
      }
    },
    isValidEpubBackgroundImage(image: ClientSettingsEpubBackgroundImage): boolean {
      return !!image?.id && !!image?.name && !!image?.dataUrl
    },
    async migrateLocalEpubBackgroundImages() {
      let changed = false
      const config = this.normalizeEpubBackgroundImages(this.epubBackgroundImages)

      if (this.settings.backgroundImageLight && config.light.length === 0) {
        const image = this.createEpubBackgroundImage(
          this.$t('epubreader.settings.background_image_light').toString(),
          this.settings.backgroundImageLight,
        )
        config.light.push(image)
        changed = true
      }

      if (this.settings.backgroundImageDark && config.dark.length === 0) {
        const image = this.createEpubBackgroundImage(
          this.$t('epubreader.settings.background_image_dark').toString(),
          this.settings.backgroundImageDark,
        )
        config.dark.push(image)
        changed = true
      }

      if (!changed) return

      this.epubBackgroundImages = config
      this.settings.backgroundImageLight = ''
      this.settings.backgroundImageDark = ''
      this.saveEpubReaderSettings()
      await this.saveEpubBackgroundImages()
    },
    getEpubBackgroundImageItems(mode: EpubBackgroundImageMode): { text: string, value: string }[] {
      return [
        {text: this.$t('epubreader.settings.background_image_none').toString(), value: ''},
        ...this.getEpubBackgroundImageList(mode).map(image => ({text: image.name, value: image.id})),
      ]
    },
    getEpubBackgroundImageList(mode: EpubBackgroundImageMode): ClientSettingsEpubBackgroundImage[] {
      return mode === 'light' ? this.epubBackgroundImages.light : this.epubBackgroundImages.dark
    },
    setEpubBackgroundImageList(mode: EpubBackgroundImageMode, images: ClientSettingsEpubBackgroundImage[]) {
      if (mode === 'light') this.epubBackgroundImages.light = images
      else this.epubBackgroundImages.dark = images
    },
    getSelectedEpubBackgroundImageId(mode: EpubBackgroundImageMode): string {
      const selection = this.getCurrentEpubBackgroundImageSelection()
      return mode === 'light' ? selection.selectedLightId || '' : selection.selectedDarkId || ''
    },
    setSelectedEpubBackgroundImageId(mode: EpubBackgroundImageMode, id: string) {
      this.setCurrentEpubBackgroundImageSelection(mode === 'light' ? {selectedLightId: id} : {selectedDarkId: id})
    },
    getSelectedEpubBackgroundImage(mode: EpubBackgroundImageMode): ClientSettingsEpubBackgroundImage | undefined {
      const id = this.getSelectedEpubBackgroundImageId(mode)
      return this.getEpubBackgroundImageList(mode).find(image => image.id === id)
    },
    getCurrentEpubBackgroundImageSelection(): ClientSettingsEpubBackgroundImageSelection {
      return this.normalizeEpubBackgroundImageSelection(this.epubBackgroundImages.books?.[this.bookId])
    },
    setCurrentEpubBackgroundImageSelection(patch: Partial<ClientSettingsEpubBackgroundImageSelection>) {
      if (!this.epubBackgroundImages.books) this.$set(this.epubBackgroundImages, 'books', {})

      const selection = {
        ...this.getCurrentEpubBackgroundImageSelection(),
        ...patch,
      }
      this.$set(this.epubBackgroundImages.books, this.bookId, this.normalizeEpubBackgroundImageSelection(selection))
    },
    async setEpubBackgroundImage(mode: EpubBackgroundImageMode, fileOrFiles?: File | File[] | null) {
      const file = Array.isArray(fileOrFiles) ? fileOrFiles[0] : fileOrFiles
      if (!file) return

      if (file.size > EPUB_BACKGROUND_IMAGE_MAX_BYTES) {
        this.sendNotification(this.$t('epubreader.settings.background_image_too_large').toString())
        this.resetEpubBackgroundImageInput(mode)
        return
      }

      const dataUrl = await this.readFileAsDataUrl(file)
      const image = this.createEpubBackgroundImage(file.name, dataUrl)
      this.setEpubBackgroundImageList(mode, [...this.getEpubBackgroundImageList(mode), image])
      this.setSelectedEpubBackgroundImageId(mode, image.id)
      this.setCurrentEpubBackgroundImageSelection({enabled: true})

      this.resetEpubBackgroundImageInput(mode)
      await this.saveEpubBackgroundImages()
      this.scheduleEpubIframeEnhancements(false)
    },
    async deleteEpubBackgroundImage(mode: EpubBackgroundImageMode) {
      const selectedId = this.getSelectedEpubBackgroundImageId(mode)
      if (!selectedId) return

      const images = this.getEpubBackgroundImageList(mode).filter(image => image.id !== selectedId)
      this.setEpubBackgroundImageList(mode, images)
      this.clearEpubBackgroundImageSelection(mode, selectedId)

      await this.saveEpubBackgroundImages()
      this.scheduleEpubIframeEnhancements(false)
    },
    clearEpubBackgroundImageSelection(mode: EpubBackgroundImageMode, deletedId: string) {
      Object.entries(this.epubBackgroundImages.books || {}).forEach(([bookId, selection]) => {
        const patch = {} as Partial<ClientSettingsEpubBackgroundImageSelection>
        if (mode === 'light' && selection.selectedLightId === deletedId) patch.selectedLightId = ''
        if (mode === 'dark' && selection.selectedDarkId === deletedId) patch.selectedDarkId = ''
        if (Object.keys(patch).length > 0) {
          this.$set(this.epubBackgroundImages.books, bookId, this.normalizeEpubBackgroundImageSelection({...selection, ...patch}))
        }
      })
    },
    createEpubBackgroundImage(name: string, dataUrl: string): ClientSettingsEpubBackgroundImage {
      return {
        id: `epub-bg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        name,
        dataUrl,
      }
    },
    resetEpubBackgroundImageInput(mode: EpubBackgroundImageMode) {
      if (mode === 'light') this.epubBackgroundImageLightFile = undefined
      else this.epubBackgroundImageDarkFile = undefined
    },
    readFileAsDataUrl(file: File): Promise<string> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result?.toString() || '')
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
    },
    async saveEpubBackgroundImages() {
      const update = {} as Record<string, ClientSettingUserUpdateDto>
      update[CLIENT_SETTING.WEBUI_EPUB_BACKGROUND_IMAGES] = {
        value: JSON.stringify(this.epubBackgroundImages),
      }
      await this.$komgaSettings.updateClientSettingUser(update)
      await this.$store.dispatch('getClientSettingsUser')
    },
    saveEpubReaderSettings() {
      this.$store.commit('setEpubreaderSettings', this.settings)
    },
    getEpubAppearanceName(): string {
      return this.appearance.replace('readium-', '').replace('-on', '').replace('default', 'day')
    },
    getEpubThemeBackgroundColor(): string {
      switch (this.getEpubAppearanceName()) {
        case 'night':
          return '#000000'
        case 'sepia':
          return '#faf4e8'
        case 'green':
          return '#c7edcc'
        default:
          return '#ffffff'
      }
    },
    getCurrentEpubBackgroundImage(): string {
      if (!this.getCurrentEpubBackgroundImageSelection().enabled) return ''

      const mode = this.getEpubAppearanceName() === 'night' ? 'dark' : 'light'
      return this.getSelectedEpubBackgroundImage(mode)?.dataUrl || ''
    },
    toCssUrl(value: string): string {
      return `url("${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`
    },
    applyEpubThemeToDocument(doc: Document) {
      const html = doc.documentElement
      const body = doc.body
      const backgroundColor = this.getEpubThemeBackgroundColor()
      const backgroundImage = this.getCurrentEpubBackgroundImage()

      html.style.setProperty('--USER__backgroundColor', backgroundColor)
      html.style.setProperty('background-color', backgroundColor, 'important')

      if (backgroundImage) {
        this.applyEpubBackgroundImageToElement(html, backgroundImage)
        if (body) {
          this.applyEpubBackgroundImageToElement(body, backgroundImage)
          body.style.setProperty('background-color', 'transparent', 'important')
        }
      } else {
        this.clearEpubBackgroundImageFromElement(html)
        if (body) {
          this.clearEpubBackgroundImageFromElement(body)
          body.style.setProperty('background-color', backgroundColor, 'important')
        }
      }
    },
    applyEpubBackgroundImageToElement(element: HTMLElement, image: string) {
      element.style.setProperty('background-image', this.toCssUrl(image), 'important')
      element.style.setProperty('background-size', 'cover', 'important')
      element.style.setProperty('background-position', 'center', 'important')
      element.style.setProperty('background-repeat', 'no-repeat', 'important')
      element.style.setProperty('background-attachment', 'fixed', 'important')
    },
    clearEpubBackgroundImageFromElement(element: HTMLElement) {
      element.style.removeProperty('background-image')
      element.style.removeProperty('background-size')
      element.style.removeProperty('background-position')
      element.style.removeProperty('background-repeat')
      element.style.removeProperty('background-attachment')
    },
    getEpubCustomStyles(): Record<string, ClientSettingsEpubCustomStyle> {
      try {
        return JSON.parse(this.$store.state.komgaSettings.clientSettingsUser[CLIENT_SETTING.WEBUI_EPUB_CUSTOM_STYLES]?.value) || {}
      } catch (e) {
        return {}
      }
    },
    async loadEpubCustomStyle(bookId: string) {
      await this.$store.dispatch('getClientSettingsUser')
      this.loadEpubBackgroundImages()
      await this.migrateLocalEpubBackgroundImages()
      const config = this.getEpubCustomStyles()[bookId]
      this.epubCustomStyleEnabled = config?.enabled || false
      this.epubCustomStyleDisableOriginalStyle = config?.disableOriginalStyle || false
      this.epubCustomStyleChineseConversion = config?.chineseConversion || 'none'
      this.epubCustomStyleCss = config?.css || ''
      this.publishEpubCustomStyle()
    },
    publishEpubCustomStyle() {
      const target = window as any
      target[EPUB_CUSTOM_STYLE_WINDOW_KEY] = {
        enabled: this.epubCustomStyleEnabled,
        disableOriginalStyle: this.epubCustomStyleDisableOriginalStyle,
        chineseConversion: this.epubCustomStyleChineseConversion,
        css: this.epubCustomStyleCss,
      } as ClientSettingsEpubCustomStyle
    },
    async saveEpubCustomStyle() {
      this.epubCustomStyleSaving = true
      try {
        const all = this.getEpubCustomStyles()
        all[this.bookId] = {
          enabled: this.epubCustomStyleEnabled,
          disableOriginalStyle: this.epubCustomStyleDisableOriginalStyle,
          chineseConversion: this.epubCustomStyleChineseConversion,
          css: this.epubCustomStyleCss,
        }

        const update = {} as Record<string, ClientSettingUserUpdateDto>
        update[CLIENT_SETTING.WEBUI_EPUB_CUSTOM_STYLES] = {
          value: JSON.stringify(all),
        }
        update[CLIENT_SETTING.WEBUI_EPUB_BACKGROUND_IMAGES] = {
          value: JSON.stringify(this.epubBackgroundImages),
        }
        await this.$komgaSettings.updateClientSettingUser(update)
        await this.$store.dispatch('getClientSettingsUser')
        await this.applyEpubIframeEnhancements()
        this.sendNotification(this.$t('epubreader.settings.custom_style_saved').toString())
      } finally {
        this.epubCustomStyleSaving = false
      }
    },
    startEpubIframeEnhancements() {
      this.stopEpubIframeEnhancements()

      const wrapper = document.getElementById('iframe-wrapper')
      if (!wrapper) return

      this.epubIframeEnhancementObserver = new MutationObserver(() => this.scheduleEpubIframeEnhancements(false))
      this.epubIframeEnhancementObserver.observe(wrapper, {childList: true, subtree: true})
      this.scheduleEpubIframeEnhancements(false)
    },
    stopEpubIframeEnhancements() {
      if (this.epubIframeEnhancementObserver) {
        this.epubIframeEnhancementObserver.disconnect()
        this.epubIframeEnhancementObserver = undefined
      }
      this.clearEpubIframeEnhancementTimers()
    },
    clearEpubIframeEnhancementTimers() {
      this.epubIframeEnhancementTimers.forEach(timer => window.clearTimeout(timer))
      this.epubIframeEnhancementTimers = []
    },
    scheduleEpubIframeEnhancements(reflow: boolean = false) {
      this.clearEpubIframeEnhancementTimers()
      this.applyEpubIframeEnhancements(reflow)

      ;[100, 300, 700, 1200].forEach(delay => {
        const timer = window.setTimeout(() => {
          this.epubIframeEnhancementTimers = this.epubIframeEnhancementTimers.filter(x => x !== timer)
          this.applyEpubIframeEnhancements(false)
        }, delay)
        this.epubIframeEnhancementTimers.push(timer)
      })
    },
    async applyEpubIframeEnhancements(reflow: boolean = true) {
      this.publishEpubCustomStyle()
      document.querySelectorAll<HTMLIFrameElement>('#iframe-wrapper iframe').forEach(iframe => {
        this.bindEpubIframeEnhancement(iframe)
        this.applyEpubEnhancementsToIframe(iframe)
      })
      if (reflow && this.d2Reader?.applyUserSettings) await this.d2Reader.applyUserSettings({})
    },
    bindEpubIframeEnhancement(iframe: HTMLIFrameElement) {
      if (iframe.dataset.komgaEpubEnhancementBound === 'true') return

      iframe.dataset.komgaEpubEnhancementBound = 'true'
      iframe.addEventListener('load', () => this.scheduleEpubIframeEnhancements(false))
    },
    applyEpubEnhancementsToIframe(iframe: HTMLIFrameElement) {
      try {
        const doc = iframe.contentDocument
        const view = iframe.contentWindow || doc?.defaultView
        if (!doc?.documentElement || !view) return

        this.bindEpubIframeTouchNavigation(doc)
        this.applyEpubVerticalWritingMode(doc, view)
        this.applyEpubAuthorStylePreference(doc)
        this.applyEpubChineseConversion(doc)
        this.applyEpubThemeToDocument(doc)
        this.applyEpubCustomStyleToDocument(doc)
        if ((doc.documentElement.getAttribute('data-komga-writing-mode') || '').indexOf('vertical') === 0) {
          this.updateEpubVerticalPaginationMetrics(doc)
          this.applyPendingVerticalEpubResourceEdge(doc)
        }
      } catch (e) {
      }
    },
    applyEpubVerticalWritingMode(doc: Document, view: Window) {
      const mode = this.detectEpubVerticalWritingMode(doc, view)
      const html = doc.documentElement

      if (!mode) {
        html.removeAttribute('data-komga-writing-mode')
        html.style.removeProperty('--KOMGA__writingMode')
        html.style.removeProperty('--KOMGA__verticalPageMask')
        this.removeEpubVerticalPageMask(doc)
        return
      }

      html.setAttribute('data-komga-writing-mode', mode)
      html.style.setProperty('--KOMGA__writingMode', mode)
      this.updateEpubVerticalPaginationMetrics(doc)
    },
    detectEpubVerticalWritingMode(doc: Document, view: Window): string {
      const selectors = [
        'main',
        'article',
        'section',
        '[style*="writing-mode"]',
        '[style*="-webkit-writing-mode"]',
        '[class*="vertical"]',
        '[class*="tcy"]',
        '[class*="vrtl"]',
      ]
      const candidates = [
        doc.documentElement,
        doc.body,
        ...selectors.map(selector => doc.querySelector(selector)),
      ]

      for (const candidate of candidates) {
        const mode = this.computedEpubWritingMode(candidate, view)
        if (mode) return mode
      }

      return ''
    },
    computedEpubWritingMode(element: Element | null, view: Window): string {
      if (!element) return ''
      const mode = view.getComputedStyle(element).writingMode || ''
      return mode.indexOf('vertical') === 0 ? mode : ''
    },
    applyEpubCustomStyleToDocument(doc: Document) {
      const config = (window as any)[EPUB_CUSTOM_STYLE_WINDOW_KEY] as ClientSettingsEpubCustomStyle | undefined
      const html = doc.documentElement
      const existing = doc.getElementById(EPUB_CUSTOM_STYLE_ID)

      if (!config?.enabled || !config.css) {
        if (existing?.parentNode) existing.parentNode.removeChild(existing)
        html.removeAttribute('data-komga-custom-style')
        return
      }

      const style = existing || doc.createElement('style')
      if (!existing) {
        style.id = EPUB_CUSTOM_STYLE_ID
        style.setAttribute('type', 'text/css')
        ;(doc.head || html).appendChild(style)
      }

      if (style.textContent !== config.css) style.textContent = config.css
      html.setAttribute('data-komga-custom-style', 'on')
    },
    applyEpubAuthorStylePreference(doc: Document) {
      const config = (window as any)[EPUB_CUSTOM_STYLE_WINDOW_KEY] as ClientSettingsEpubCustomStyle | undefined
      const disableOriginalStyle = config?.disableOriginalStyle || false

      doc.head?.querySelectorAll<HTMLElement>('link[rel~="stylesheet"], style').forEach(element => {
        if (this.shouldPreserveEpubStyleElement(element)) {
          this.restoreEpubStyleElement(element)
          return
        }

        if (disableOriginalStyle) this.disableEpubStyleElement(element)
        else this.restoreEpubStyleElement(element)
      })

      doc.body?.querySelectorAll<HTMLElement>(
        [
          '[style]',
          'img[width]',
          'img[height]',
          '[data-komga-author-inline-style-disabled]',
          '[data-komga-author-image-size-disabled]',
        ].join(','),
      ).forEach(element => {
        if (disableOriginalStyle) this.disableEpubInlineAuthorStyle(element)
        else this.restoreEpubInlineAuthorStyle(element)
      })

      if (disableOriginalStyle) doc.documentElement.setAttribute('data-komga-author-style-disabled', 'on')
      else doc.documentElement.removeAttribute('data-komga-author-style-disabled')
    },
    shouldPreserveEpubStyleElement(element: HTMLElement): boolean {
      if (element.id === EPUB_CUSTOM_STYLE_ID) return true

      if (element.tagName.toLowerCase() !== 'link') return false

      const href = (element as HTMLLinkElement).href
      return EPUB_READER_STYLE_URLS.some(url => this.sameEpubStyleUrl(href, url)) || href.includes('/api/v1/fonts/resource/')
    },
    sameEpubStyleUrl(href: string, target: string): boolean {
      try {
        return new URL(href, window.location.href).href === new URL(target, window.location.href).href
      } catch (e) {
        return href === target
      }
    },
    disableEpubStyleElement(element: HTMLElement) {
      if (element.dataset[EPUB_AUTHOR_STYLE_DISABLED_ATTR] !== 'true') {
        element.dataset[EPUB_AUTHOR_STYLE_ORIGINAL_MEDIA_ATTR] = element.getAttribute('media') || ''
      }

      element.dataset[EPUB_AUTHOR_STYLE_DISABLED_ATTR] = 'true'
      element.setAttribute('media', 'not all')
    },
    restoreEpubStyleElement(element: HTMLElement) {
      if (element.dataset[EPUB_AUTHOR_STYLE_DISABLED_ATTR] !== 'true') return

      const originalMedia = element.dataset[EPUB_AUTHOR_STYLE_ORIGINAL_MEDIA_ATTR]
      if (originalMedia) element.setAttribute('media', originalMedia)
      else element.removeAttribute('media')

      delete element.dataset[EPUB_AUTHOR_STYLE_DISABLED_ATTR]
      delete element.dataset[EPUB_AUTHOR_STYLE_ORIGINAL_MEDIA_ATTR]
    },
    disableEpubInlineAuthorStyle(element: HTMLElement) {
      if (this.isKomgaEpubReaderElement(element)) return

      const originalStyle = element.getAttribute('style')
      if (originalStyle && element.dataset[EPUB_AUTHOR_INLINE_STYLE_DISABLED_ATTR] !== 'true') {
        element.dataset[EPUB_AUTHOR_ORIGINAL_INLINE_STYLE_ATTR] = originalStyle
      }

      if (originalStyle) {
        EPUB_AUTHOR_INLINE_STYLE_PROPERTIES.forEach(property => element.style.removeProperty(property))
        if (!element.getAttribute('style')?.trim()) element.removeAttribute('style')
        element.dataset[EPUB_AUTHOR_INLINE_STYLE_DISABLED_ATTR] = 'true'
      }

      if (this.isEpubImageElement(element) && this.shouldDisableEpubImageSize(element)) {
        const image = element as HTMLImageElement
        if (image.dataset[EPUB_AUTHOR_IMAGE_SIZE_DISABLED_ATTR] !== 'true') {
          image.dataset[EPUB_AUTHOR_ORIGINAL_WIDTH_ATTR] = image.getAttribute('width') || ''
          image.dataset[EPUB_AUTHOR_ORIGINAL_HEIGHT_ATTR] = image.getAttribute('height') || ''
        }

        image.removeAttribute('width')
        image.removeAttribute('height')
        image.style.removeProperty('width')
        image.style.removeProperty('height')
        if (!image.getAttribute('style')?.trim()) image.removeAttribute('style')
        image.dataset[EPUB_AUTHOR_IMAGE_SIZE_DISABLED_ATTR] = 'true'
      }
    },
    restoreEpubInlineAuthorStyle(element: HTMLElement) {
      if (this.isKomgaEpubReaderElement(element)) return

      if (element.dataset[EPUB_AUTHOR_INLINE_STYLE_DISABLED_ATTR] === 'true') {
        const originalStyle = element.dataset[EPUB_AUTHOR_ORIGINAL_INLINE_STYLE_ATTR]
        if (originalStyle) element.setAttribute('style', originalStyle)
        else element.removeAttribute('style')

        delete element.dataset[EPUB_AUTHOR_INLINE_STYLE_DISABLED_ATTR]
        delete element.dataset[EPUB_AUTHOR_ORIGINAL_INLINE_STYLE_ATTR]
      }

      if (this.isEpubImageElement(element) && element.dataset[EPUB_AUTHOR_IMAGE_SIZE_DISABLED_ATTR] === 'true') {
        const image = element as HTMLImageElement
        const originalWidth = image.dataset[EPUB_AUTHOR_ORIGINAL_WIDTH_ATTR]
        const originalHeight = image.dataset[EPUB_AUTHOR_ORIGINAL_HEIGHT_ATTR]
        if (originalWidth) image.setAttribute('width', originalWidth)
        else image.removeAttribute('width')
        if (originalHeight) image.setAttribute('height', originalHeight)
        else image.removeAttribute('height')

        delete image.dataset[EPUB_AUTHOR_IMAGE_SIZE_DISABLED_ATTR]
        delete image.dataset[EPUB_AUTHOR_ORIGINAL_WIDTH_ATTR]
        delete image.dataset[EPUB_AUTHOR_ORIGINAL_HEIGHT_ATTR]
      }
    },
    shouldDisableEpubImageSize(element: HTMLImageElement): boolean {
      const width = this.parseEpubImageSize(element.getAttribute('width'))
      const height = this.parseEpubImageSize(element.getAttribute('height'))
      const styleWidth = this.parseEpubImageSize(element.style.width)
      const styleHeight = this.parseEpubImageSize(element.style.height)
      const size = Math.max(width, height, styleWidth, styleHeight)
      return size > 0 && size <= 80
    },
    isEpubImageElement(element: HTMLElement): boolean {
      return element.tagName.toLowerCase() === 'img'
    },
    isKomgaEpubReaderElement(element: HTMLElement): boolean {
      return element.id === EPUB_VERTICAL_PAGE_MASK_ID
    },
    parseEpubImageSize(value: string | null): number {
      if (!value) return 0
      const match = value.trim().match(/^(\d+(?:\.\d+)?)(?:px)?$/i)
      return match ? Number(match[1]) : 0
    },
    applyEpubChineseConversion(doc: Document) {
      const config = (window as any)[EPUB_CUSTOM_STYLE_WINDOW_KEY] as ClientSettingsEpubCustomStyle | undefined
      const mode = config?.chineseConversion || 'none'
      const root = doc.body
      if (!root) return

      const converter = this.getEpubChineseConverter(mode)
      const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      const nodes = [] as Text[]
      let node = walker.nextNode()
      while (node) {
        nodes.push(node as Text)
        node = walker.nextNode()
      }

      nodes.forEach(textNode => this.applyEpubChineseConversionToTextNode(textNode, converter))
      doc.documentElement.setAttribute('data-komga-chinese-conversion', mode)
    },
    getEpubChineseConverter(mode: ClientSettingsEpubChineseConversion): ConverterFunction | undefined {
      if (mode === 'none') return undefined
      if (!EPUB_CHINESE_CONVERTERS[mode]) {
        EPUB_CHINESE_CONVERTERS[mode] = mode === 'simplified'
          ? OpenCC.Converter({from: 't', to: 'cn'})
          : OpenCC.Converter({from: 'cn', to: 'tw'})
      }
      return EPUB_CHINESE_CONVERTERS[mode]
    },
    applyEpubChineseConversionToTextNode(textNode: Text, converter?: ConverterFunction) {
      if (!this.shouldConvertEpubChineseTextNode(textNode)) {
        const original = EPUB_CHINESE_TEXT_ORIGINALS.get(textNode)
        if (original !== undefined) {
          textNode.nodeValue = original
          EPUB_CHINESE_TEXT_ORIGINALS.delete(textNode)
        }
        return
      }

      const current = textNode.nodeValue || ''
      const original = EPUB_CHINESE_TEXT_ORIGINALS.get(textNode) || current
      if (!converter) {
        if (EPUB_CHINESE_TEXT_ORIGINALS.has(textNode)) {
          textNode.nodeValue = original
          EPUB_CHINESE_TEXT_ORIGINALS.delete(textNode)
        }
        return
      }

      if (!EPUB_CHINESE_TEXT_ORIGINALS.has(textNode)) EPUB_CHINESE_TEXT_ORIGINALS.set(textNode, original)
      const converted = converter(original)
      if (converted !== current) textNode.nodeValue = converted
    },
    shouldConvertEpubChineseTextNode(textNode: Text): boolean {
      const value = textNode.nodeValue
      if (!value || !EPUB_CHINESE_TEXT_PATTERN.test(value)) return false

      const parent = textNode.parentElement
      if (!parent) return false
      return !parent.closest(EPUB_CHINESE_CONVERSION_SKIP_SELECTOR)
    },
    nextEpubPageControl(event: MouseEvent) {
      if (this.isVerticalEpubPaginationActive()) {
        this.stopEpubPageEvent(event)
        this.nextEpubPage()
      }
    },
    previousEpubPageControl(event: MouseEvent) {
      if (this.isVerticalEpubPaginationActive()) {
        this.stopEpubPageEvent(event)
        this.previousEpubPage()
      }
    },
    nextEpubPage() {
      if (this.isVerticalEpubPaginationActive()) {
        if (!this.tryMoveVerticalEpubPage(1)) this.nextEpubResource()
        return
      }

      this.d2Reader.nextPage()
    },
    previousEpubPage() {
      if (this.isVerticalEpubPaginationActive()) {
        if (!this.tryMoveVerticalEpubPage(-1)) this.previousEpubResource()
        return
      }

      this.d2Reader.previousPage()
    },
    nextEpubResource() {
      if (!this.goToEpubResource(1)) {
        const reader = this.d2Reader as D2Reader & { nextResource?: () => void }
        if (reader.nextResource) reader.nextResource()
        else this.d2Reader.nextPage()
      }
    },
    previousEpubResource() {
      if (!this.goToEpubResource(-1)) {
        const reader = this.d2Reader as D2Reader & { previousResource?: () => void }
        if (reader.previousResource) reader.previousResource()
        else this.d2Reader.previousPage()
      }
    },
    goToEpubResource(offset: 1 | -1): boolean {
      const navigator = (this.d2Reader as D2Reader & { navigator?: EpubNavigator }).navigator
      const publication = navigator?.publication
      const currentHref = navigator?.currentChapterLink?.href || this.getCurrentEpubDocumentHref() || this.currentLocation?.href

      if (publication && currentHref) {
        const absoluteCurrentHref = /^[a-z][a-z0-9+.-]*:/i.test(currentHref) ? currentHref : publication.getAbsoluteHref(currentHref)
        const target = offset > 0 ? publication.getNextSpineItem(absoluteCurrentHref) : publication.getPreviousSpineItem(absoluteCurrentHref)
        const targetHref = this.getEpubReadingOrderHref(target)
        if (target && targetHref) return this.goToEpubResourceHref(publication.getAbsoluteHref(targetHref), target, offset)
      }

      const reader = this.d2Reader as D2Reader & {
        readingOrder?: EpubReadingOrderItem[],
        currentResource?: number,
      }
      const readingOrder = reader.readingOrder || []
      if (readingOrder.length === 0) return false

      const currentIndex = this.getCurrentEpubResourceIndex(readingOrder)
      if (currentIndex === undefined) return false

      const target = readingOrder[currentIndex + offset]
      const href = this.getEpubReadingOrderHref(target)
      if (!href) return false

      return this.goToEpubResourceHref(href, target, offset)
    },
    goToEpubResourceHref(href: string, target: EpubReadingOrderItem, offset: 1 | -1): boolean {
      this.pendingVerticalEpubResourceEdge = offset > 0 ? 'start' : 'end'
      this.d2Reader.goTo({
        href,
        locations: {
          progression: 0,
        },
        title: target.title || target.Title,
        type: target.type || target.TypeLink,
      })
      return true
    },
    getCurrentEpubResourceIndex(readingOrder: EpubReadingOrderItem[]): number | undefined {
      const currentHrefs = [
        this.getCurrentEpubDocumentHref(),
        this.currentLocation?.href,
      ].filter((href): href is string => !!href)

      for (const currentHref of currentHrefs) {
        const index = readingOrder.findIndex(item => this.sameEpubResourceHref(this.getEpubReadingOrderHref(item), currentHref))
        if (index >= 0) return index
      }

      const reader = this.d2Reader as D2Reader & { currentResource?: number }
      if (reader.currentResource !== undefined && reader.currentResource >= 0 && reader.currentResource < readingOrder.length) return reader.currentResource

      return undefined
    },
    getEpubReadingOrderHref(item?: EpubReadingOrderItem): string | undefined {
      return item?.href || item?.Href
    },
    getCurrentEpubDocumentHref(): string | undefined {
      const doc = document.querySelector<HTMLIFrameElement>('#iframe-wrapper iframe')?.contentDocument
      const baseHref = doc?.querySelector('base')?.getAttribute('href')
      return baseHref || doc?.location?.href
    },
    sameEpubResourceHref(a?: string, b?: string): boolean {
      if (!a || !b) return false

      const normalize = (href: string): string => {
        try {
          if (!/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith('/')) {
            return decodeURIComponent(href.split('#')[0].split('?')[0]).replace(/\/+/g, '/').replace(/\/$/, '')
          }
          const url = new URL(href, window.location.href)
          return decodeURIComponent(url.pathname).replace(/\/+/g, '/').replace(/\/$/, '')
        } catch (e) {
          return decodeURIComponent(href.split('#')[0].split('?')[0]).replace(/\/+/g, '/').replace(/\/$/, '')
        }
      }

      const normalizedA = normalize(a)
      const normalizedB = normalize(b)
      return normalizedA === normalizedB || normalizedA.endsWith(`/${normalizedB}`) || normalizedB.endsWith(`/${normalizedA}`)
    },
    bindEpubIframeTouchNavigation(doc: Document) {
      const html = doc.documentElement
      if (html.dataset.komgaEpubTouchNavigationBound === 'true') return

      html.dataset.komgaEpubTouchNavigationBound = 'true'
      doc.addEventListener('touchstart', this.handleEpubIframeTouchStart, {capture: true, passive: true})
      doc.addEventListener('touchmove', this.handleEpubIframeTouchMove, {capture: true, passive: false})
      doc.addEventListener('touchend', this.handleEpubIframeTouchEnd, {capture: true, passive: false})
      doc.addEventListener('touchcancel', this.handleEpubIframeTouchCancel, {capture: true, passive: true})
    },
    stopEpubPageEvent(event: Event) {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    },
    handleEpubIframeTouchStart(event: TouchEvent) {
      if (!this.shouldHandleEpubIframeTouch(event) || event.touches.length !== 1) {
        this.epubTouchStart = undefined
        return
      }

      const touch = event.touches[0]
      this.epubTouchStart = {
        x: touch.clientX,
        y: touch.clientY,
      }
    },
    handleEpubIframeTouchMove(event: TouchEvent) {
      const start = this.epubTouchStart
      if (!start || !this.shouldHandleEpubIframeTouch(event) || event.touches.length !== 1) return

      const touch = event.touches[0]
      if (this.getEpubHorizontalSwipeDirection(start, touch.clientX, touch.clientY) !== 0) {
        this.stopEpubPageEvent(event)
      }
    },
    handleEpubIframeTouchEnd(event: TouchEvent) {
      const start = this.epubTouchStart
      this.epubTouchStart = undefined
      if (!start || !this.shouldHandleEpubIframeTouch(event) || event.changedTouches.length === 0) return

      const touch = event.changedTouches[0]
      const swipeDirection = this.getEpubHorizontalSwipeDirection(start, touch.clientX, touch.clientY)
      if (swipeDirection === 0) return

      this.stopEpubPageEvent(event)
      this.handleEpubHorizontalSwipe(swipeDirection)
    },
    handleEpubIframeTouchCancel() {
      this.epubTouchStart = undefined
    },
    shouldHandleEpubIframeTouch(event: TouchEvent): boolean {
      if (this.verticalScroll) return false
      if (this.isInteractiveEpubTouchTarget(event.target)) return false

      const doc = this.getEpubTouchDocument(event)
      const view = doc?.defaultView
      const html = doc?.documentElement
      if (!doc || !view || !html) return false

      const mode = html.getAttribute('data-komga-writing-mode') || this.detectEpubVerticalWritingMode(doc, view)
      return mode.indexOf('vertical') === 0
    },
    isInteractiveEpubTouchTarget(target: EventTarget | null): boolean {
      const element = target as Element | null
      return !!element?.closest?.('a, button, input, textarea, select, option, label, audio, video')
    },
    getEpubTouchDocument(event: TouchEvent): Document | undefined {
      const currentTarget = event.currentTarget as Document | Window | null
      if (currentTarget && 'documentElement' in currentTarget) return currentTarget
      if (currentTarget && 'document' in currentTarget) return currentTarget.document
      return (event.target as Node | null)?.ownerDocument || undefined
    },
    getEpubHorizontalSwipeDirection(start: EpubTouchStart, x: number, y: number): -1 | 0 | 1 {
      const deltaX = x - start.x
      const deltaY = y - start.y
      const absX = Math.abs(deltaX)
      const absY = Math.abs(deltaY)
      if (absX < EPUB_HORIZONTAL_SWIPE_MIN_DISTANCE) return 0
      if (absX < absY * EPUB_HORIZONTAL_SWIPE_DOMINANCE_RATIO) return 0
      return deltaX < 0 ? -1 : 1
    },
    handleEpubHorizontalSwipe(swipeDirection: -1 | 1) {
      const leftSwipeAction = this.epubVerticalSwipeLeftAction
      const action = swipeDirection < 0
        ? leftSwipeAction
        : leftSwipeAction === 'next' ? 'previous' : 'next'

      if (action === 'next') this.nextEpubPage()
      else this.previousEpubPage()
    },
    isVerticalEpubPaginationActive(): boolean {
      if (this.verticalScroll) return false

      const iframe = document.querySelector<HTMLIFrameElement>('#iframe-wrapper iframe')
      const doc = iframe?.contentDocument
      const html = doc?.documentElement
      const view = iframe?.contentWindow || doc?.defaultView
      const mode = html?.getAttribute('data-komga-writing-mode') || (doc && view ? this.detectEpubVerticalWritingMode(doc, view) : '')
      return !!doc && !!html && mode.indexOf('vertical') === 0
    },
    tryMoveVerticalEpubPage(direction: 1 | -1): boolean {
      if (this.verticalScroll) return false

      const iframe = document.querySelector<HTMLIFrameElement>('#iframe-wrapper iframe')
      const doc = iframe?.contentDocument
      const html = doc?.documentElement
      const view = iframe?.contentWindow || doc?.defaultView
      const mode = html?.getAttribute('data-komga-writing-mode') || (doc && view ? this.detectEpubVerticalWritingMode(doc, view) : '')
      if (!doc || !html || mode.indexOf('vertical') !== 0) return false

      const scroller = doc.scrollingElement as HTMLElement | null
      if (!scroller) return false

      const {pageStep} = this.getVerticalEpubPaginationMetrics(scroller, doc, iframe)
      const maxOffset = Math.max(0, scroller.scrollWidth - scroller.clientWidth)
      if (maxOffset <= 1) return false

      const pageDirection = mode.indexOf('vertical-rl') === 0 ? -1 : 1
      const current = scroller.scrollLeft
      const currentPageIndex = Math.round(Math.abs(current) / pageStep)
      const lastPageIndex = Math.max(0, Math.ceil(maxOffset / pageStep))
      if (direction < 0 && currentPageIndex <= 0) return false
      if (direction > 0 && currentPageIndex >= lastPageIndex) return false

      const targetPageIndex = Math.max(0, Math.min(lastPageIndex, currentPageIndex + direction))
      const target = this.clampVerticalEpubScrollLeft(
        targetPageIndex * pageStep * pageDirection,
        pageDirection,
        maxOffset,
      )
      if (Math.abs(target - current) <= 1) return false

      scroller.scrollLeft = target
      if (Math.abs(scroller.scrollLeft - current) <= 1) return false

      this.updateEpubVerticalPaginationMetrics(doc)
      this.updateVerticalEpubPosition(scroller, pageStep, maxOffset)
      return true
    },
    updateEpubVerticalPaginationMetrics(doc: Document) {
      const scroller = doc.scrollingElement as HTMLElement | null
      if (!scroller) return

      const iframe = doc.defaultView?.frameElement as HTMLIFrameElement | null
      const mode = doc.documentElement.getAttribute('data-komga-writing-mode') || ''
      const {maskWidth} = this.getVerticalEpubPaginationMetrics(scroller, doc, iframe || undefined, mode)
      doc.documentElement.style.setProperty('--KOMGA__verticalPageMask', `${maskWidth}px`)
      this.removeEpubVerticalPageMask(doc)
    },
    applyPendingVerticalEpubResourceEdge(doc: Document) {
      const edge = this.pendingVerticalEpubResourceEdge
      if (!edge) return

      const scroller = doc.scrollingElement as HTMLElement | null
      if (!scroller) return

      const mode = doc.documentElement.getAttribute('data-komga-writing-mode') || ''
      const pageDirection = mode.indexOf('vertical-rl') === 0 ? -1 : 1
      const maxOffset = Math.max(0, scroller.scrollWidth - scroller.clientWidth)
      const iframe = doc.defaultView?.frameElement as HTMLIFrameElement | null
      const {pageStep} = this.getVerticalEpubPaginationMetrics(scroller, doc, iframe || undefined, mode)

      scroller.scrollLeft = edge === 'end' ? this.clampVerticalEpubScrollLeft(pageDirection * maxOffset, pageDirection, maxOffset) : 0
      this.updateVerticalEpubPosition(scroller, pageStep, maxOffset)
      this.pendingVerticalEpubResourceEdge = undefined
    },
    getVerticalEpubPaginationMetrics(scroller: HTMLElement, doc: Document, iframe?: HTMLIFrameElement, mode?: string): { pageStep: number, maskWidth: number } {
      const pageWidth = Math.max(1, scroller.clientWidth || iframe?.clientWidth || this.$vuetify.breakpoint.width)
      const lineAdvance = this.getVerticalEpubLineAdvance(doc)
      const edgeOverflow = this.measureVerticalEpubEdgeOverflow(doc, mode || doc.documentElement.getAttribute('data-komga-writing-mode') || '', pageWidth, lineAdvance)
      const pageColumns = Math.max(1, Math.floor((pageWidth - edgeOverflow) / lineAdvance))
      const pageStep = Math.min(pageWidth, pageColumns * lineAdvance)
      const maskWidth = Math.max(0, pageWidth - pageStep)
      return {pageStep, maskWidth}
    },
    getVerticalEpubLineAdvance(doc: Document): number {
      return this.measureVerticalEpubLineAdvance(doc) || this.getComputedVerticalEpubLineAdvance(doc)
    },
    getComputedVerticalEpubLineAdvance(doc: Document): number {
      const bodyStyle = doc.defaultView?.getComputedStyle(doc.body)
      const htmlStyle = doc.defaultView?.getComputedStyle(doc.documentElement)
      const fontSize = this.parseCssPixelValue(bodyStyle?.fontSize) || this.parseCssPixelValue(htmlStyle?.fontSize) || 16
      const lineHeight = this.parseCssPixelValue(bodyStyle?.lineHeight) || this.parseCssPixelValue(htmlStyle?.lineHeight) || fontSize * 1.5
      return Math.max(1, Math.ceil(Math.max(fontSize, lineHeight)))
    },
    measureVerticalEpubLineAdvance(doc: Document): number {
      const positions = this.collectVerticalEpubTextRectPositions(doc, 260).map(rect => rect.left)
      const columns = this.groupVerticalEpubPositions(positions)
      const diffs = [] as number[]

      for (let i = 1; i < columns.length; i++) {
        const diff = Math.abs(columns[i] - columns[i - 1])
        if (diff >= 6 && diff <= 120) diffs.push(diff)
      }

      if (diffs.length === 0) return 0
      diffs.sort((a, b) => a - b)
      return Math.max(1, Math.ceil(diffs[Math.floor(diffs.length / 2)]))
    },
    collectVerticalEpubTextRectPositions(doc: Document, maxRects: number): DOMRect[] {
      const root = doc.body
      if (!root) return []

      const rects = [] as DOMRect[]
      const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()

      while (node && rects.length < maxRects) {
        const textNode = node as Text
        const value = textNode.nodeValue || ''
        const parent = textNode.parentElement

        if (parent && value.trim() && !parent.closest(EPUB_CHINESE_CONVERSION_SKIP_SELECTOR) && !this.isKomgaEpubReaderElement(parent)) {
          const range = doc.createRange()
          const length = Math.min(value.length, 180)

          for (let i = 0; i < length && rects.length < maxRects; i++) {
            if (!value[i]?.trim()) continue

            try {
              range.setStart(textNode, i)
              range.setEnd(textNode, i + 1)
              const rect = Array.from(range.getClientRects()).find(item => item.width > 0 && item.height > 0)
              if (rect) rects.push(rect)
            } catch (e) {
            }
          }

          range.detach()
        }

        node = walker.nextNode()
      }

      return rects
    },
    groupVerticalEpubPositions(positions: number[]): number[] {
      const sorted = positions
        .filter(position => Number.isFinite(position))
        .sort((a, b) => a - b)
      const groups = [] as number[]

      sorted.forEach(position => {
        const last = groups[groups.length - 1]
        if (last === undefined || Math.abs(position - last) > 2) groups.push(position)
        else groups[groups.length - 1] = (last + position) / 2
      })

      return groups
    },
    measureVerticalEpubEdgeOverflow(doc: Document, mode: string, pageWidth: number, lineAdvance: number): number {
      const rects = this.collectVerticalEpubTextRectPositions(doc, 360)
      let overflow = 0

      if (mode.indexOf('vertical-rl') === 0) {
        rects.forEach(rect => {
          if (rect.left < 1 && rect.right > 1) overflow = Math.max(overflow, rect.right)
        })
      } else if (mode.indexOf('vertical-lr') === 0) {
        rects.forEach(rect => {
          if (rect.left < pageWidth - 1 && rect.right > pageWidth - 1) overflow = Math.max(overflow, pageWidth - rect.left)
        })
      }

      return Math.min(lineAdvance, Math.max(0, Math.ceil(overflow) + 2))
    },
    updateEpubVerticalPageMask(doc: Document, mode: string, maskWidth: number) {
      if (!doc.body || this.verticalScroll || mode.indexOf('vertical') !== 0 || maskWidth <= 0) {
        this.removeEpubVerticalPageMask(doc)
        return
      }

      const mask = (doc.getElementById(EPUB_VERTICAL_PAGE_MASK_ID) || doc.createElement('div')) as HTMLElement
      if (!mask.parentElement) {
        mask.id = EPUB_VERTICAL_PAGE_MASK_ID
        mask.setAttribute('aria-hidden', 'true')
        doc.body.appendChild(mask)
      }

      mask.style.setProperty('all', 'initial')
      mask.style.setProperty('position', 'fixed', 'important')
      mask.style.setProperty('top', '0', 'important')
      mask.style.setProperty('bottom', '0', 'important')
      mask.style.setProperty('width', `${Math.ceil(maskWidth)}px`, 'important')
      mask.style.setProperty('background-color', this.getEpubDocumentBackgroundColor(doc), 'important')
      mask.style.setProperty('pointer-events', 'none', 'important')
      mask.style.setProperty('z-index', '2147483647', 'important')
      mask.style.setProperty('writing-mode', 'horizontal-tb', 'important')
      mask.style.setProperty('display', 'block', 'important')

      if (mode.indexOf('vertical-rl') === 0) {
        mask.style.setProperty('left', '0', 'important')
        mask.style.removeProperty('right')
      } else {
        mask.style.setProperty('right', '0', 'important')
        mask.style.removeProperty('left')
      }
    },
    removeEpubVerticalPageMask(doc: Document) {
      const mask = doc.getElementById(EPUB_VERTICAL_PAGE_MASK_ID)
      if (mask?.parentElement) mask.parentElement.removeChild(mask)
    },
    getEpubDocumentBackgroundColor(doc: Document): string {
      const view = doc.defaultView
      const colors = [
        view?.getComputedStyle(doc.documentElement).backgroundColor,
        doc.body ? view?.getComputedStyle(doc.body).backgroundColor : undefined,
      ]
      return colors.find(color => !!color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') || '#FFFFFF'
    },
    parseCssPixelValue(value?: string): number {
      if (!value) return 0
      const parsed = Number.parseFloat(value)
      return Number.isFinite(parsed) ? parsed : 0
    },
    clampVerticalEpubScrollLeft(value: number, pageDirection: number, maxOffset: number): number {
      if (pageDirection < 0) return Math.max(-maxOffset, Math.min(0, value))
      return Math.max(0, Math.min(maxOffset, value))
    },
    updateVerticalEpubPosition(scroller: HTMLElement, pageStep: number, maxOffset: number) {
      const pageCount = Math.max(1, Math.ceil(maxOffset / pageStep) + 1)
      const page = Math.min(pageCount, Math.round(Math.abs(scroller.scrollLeft) / pageStep) + 1)
      this.progressionPage = page
      this.progressionPageCount = pageCount
    },
    appearanceClass(suffix?: string): string {
      let c = this.appearance.replace('readium-', '').replace('-on', '').replace('default', 'day')
      if (suffix) c += `-${suffix}`
      return c
    },
    goToEntry(tocEntry: TocEntry) {
      if (tocEntry.href !== undefined) {
        const url = new URL(tocEntry.href)
        let locations = {
          progression: 0,
        } as Locations
        let href = tocEntry.href
        if (url.hash) {
          locations = {
            fragment: url.hash.slice(1),
          }
          href = tocEntry.href.substring(0, tocEntry.href.indexOf('#'))
        }
        let locator = {
          href: href,
          locations: locations,
        }
        this.d2Reader.goTo(locator)
        this.showToc = false
      }
    },
    closeDialog() {
      if (this.showToc) {
        this.showToc = false
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
    closeBook() {
      this.$router.push(
        {
          name: this.book.oneshot ? 'browse-oneshot' : 'browse-book',
          params: {bookId: this.bookId.toString(), seriesId: this.book.seriesId},
          query: {context: this.context.origin, contextId: this.context.id},
        })
    },
    cycleViewingTheme() {
      const i = (this.appearances.map(x => x.value).indexOf(this.settings.appearance) + 1) % this.appearances.length
      const newValue = this.appearances[i]
      this.appearance = newValue.value
      const text = this.$t(newValue.text)
      this.sendNotification(`${this.$t('epubreader.settings.viewing_theme')}: ${text}`)
    },
    changeLayout(scroll: boolean) {
      this.verticalScroll = scroll
      const text = scroll ? this.$t('epubreader.settings.layout_scroll') : this.$t('epubreader.settings.layout_paginated')
      this.sendNotification(`${this.$t('epubreader.settings.layout')}: ${text}`)
    },
    cyclePagination() {
      if (this.verticalScroll) {
        this.columnCount = 'auto'
        this.changeLayout(false)
      } else {
        const i = (this.columnCounts.map(x => x.value).indexOf(this.settings.columnCount) + 1) % this.columnCounts.length
        const newValue = this.columnCounts[i]
        this.columnCount = newValue.value
        const text = this.$t(newValue.text)
        this.sendNotification(`${this.$t('epubreader.settings.column_count')}: ${text}`)
      }
    },
    changeFontSize(increase: boolean) {
      this.fontSize += increase ? 10 : -10
    },
    sendNotification(message: string, timeout: number = 4000) {
      this.notification.timeout = timeout
      this.notification.message = message
      this.notification.enabled = true
    },
    markProgress: debounce(function (this: any, location: Locator) {
      if (!this.incognito) {
        this.$komgaBooks.updateProgression(this.bookId, createR2Progression(location))
      }
    }, 500),
  },
})
</script>
<style src="@d-i-t-a/reader/dist/reader.css"/>
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

.sepia-bg {
  background-color: #faf4e8;
}

.sepia {
  color: #5B5852;
}

.day-bg {
  background-color: #fff;
}

.day {
  color: #5B5852;
}

.green-bg {
  background-color: #c7edcc;
}

.green {
  color: #33533a;
}

.epub-status-bar {
  box-sizing: border-box;
  z-index: 13;
}

.night-bg {
  background-color: #000000;
}

.night {
  color: #DADADA;
}

.scrolltab {
  overflow-y: scroll;
}

.scrolltab-content {
  max-height: calc(100vh - 48px);
}

.hidden {
  display: none !important;
}
/*修复移动端视口不正常的BUG */
#iframe-wrapper {
  /* 使用 dvh (Dynamic Viewport Height) 自动适配移动端浏览器工具栏 */
  height: 100vh !important;
  height: 100dvh !important; 
  width: 100%;
  overflow: hidden;
  position: relative;
}
</style>
