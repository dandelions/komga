<template>
  <div v-if="!$_.isEmpty(book)" class="browse-book-view">
    <toolbar-sticky>
      <v-tooltip bottom :disabled="!isAdmin">
        <template v-slot:activator="{ on }">
          <v-btn icon
                 v-on="on"
                 :to="parentLocation"
          >
            <rtl-icon icon="mdi-arrow-left" rtl="mdi-arrow-right"/>
          </v-btn>
        </template>
        <span v-if="contextReadList">{{ $t('common.go_to_readlist') }}</span>
        <span v-else>{{ $t('common.go_to_series') }}</span>
      </v-tooltip>

      <!--   Action menu   -->
      <book-actions-menu v-if="book"
                         :book="book"
                         @analyzed="refreshAfterAnalyze"
      />

      <v-btn icon @click="editBook" v-if="isAdmin">
        <v-icon>mdi-pencil</v-icon>
      </v-btn>

      <v-spacer/>

      <!--   Context notification for navigation   -->
      <v-alert
        v-if="contextReadList && $vuetify.breakpoint.mdAndUp"
        type="info"
        text
        dense
        border="right"
        class="mb-0"
      >{{ $t('browse_book.navigation_within_readlist', {name: contextName}) }}
      </v-alert>

      <!--   Navigate to previous book   -->
      <v-btn
        icon
        :disabled="$_.isEmpty(siblingPrevious)"
        :to="{ name: siblingPrevious.oneshot ? 'browse-oneshot' : 'browse-book', params: { seriesId: siblingPrevious.seriesId, bookId: previousId }, query: { context: context.origin, contextId: context.id}  }"
      >
        <rtl-icon icon="mdi-chevron-left" rtl="mdi-chevron-right"/>
      </v-btn>

      <!--   List of all books in context (series/readlist) for navigation   -->
      <v-menu bottom
              offset-y
              :max-height="$vuetify.breakpoint.height * .7"
              :max-width="250"
      >
        <template v-slot:activator="{ on }">
          <v-btn icon v-on="on">
            <v-icon>mdi-menu</v-icon>
          </v-btn>
        </template>

        <v-list
          flat
        >
          <v-list-item-group color="primary">
            <v-list-item
              v-for="(book, i) in siblings"
              :key="i"
              :to="{ name: book.oneshot ? 'browse-oneshot' : 'browse-book', params: { seriesId: book.seriesId, bookId: book.id }, query: { context: context.origin, contextId: context.id}  }"
            >
              <v-list-item-title class="text-wrap text-body-2">
                <template v-if="contextReadList && !book.oneshot">{{ book.seriesTitle }} {{ book.metadata.number }}:
                  {{ book.metadata.title }}
                </template>
                <template v-else-if="contextReadList && book.oneshot">{{ book.metadata.title }}</template>
                <template v-else>{{ book.metadata.number }} - {{ book.metadata.title }}</template>
              </v-list-item-title>
            </v-list-item>
          </v-list-item-group>
        </v-list>
      </v-menu>

      <!--   Navigate to next book   -->
      <v-btn
        icon
        :disabled="$_.isEmpty(siblingNext)"
        :to="{ name: siblingNext.oneshot ? 'browse-oneshot' : 'browse-book', params: { seriesId: siblingNext.seriesId, bookId: nextId }, query: { context: context.origin, contextId: context.id}  }"
      >
        <rtl-icon icon="mdi-chevron-right" rtl="mdi-chevron-left"/>
      </v-btn>
    </toolbar-sticky>

    <v-container fluid class="pa-6">
      <!--   Context notification for navigation   -->
      <v-row>
        <v-alert
          v-if="contextReadList && $vuetify.breakpoint.smAndDown"
          type="info"
          text
          dense
          border="right"
          class="mb-0"
        >{{ $t('browse_book.navigation_within_readlist', {name: contextName}) }}
        </v-alert>
      </v-row>

      <v-row>
        <v-col cols="4" sm="4" md="auto" lg="auto" xl="auto" style="min-width: 0; max-width: 100%;">
          <item-card
            v-if="book.hasOwnProperty('id')"
            width="212"
            style="max-width: 100%"
            :item="book"
            thumbnail-only
            no-link
            :action-menu="false"
          ></item-card>
          <div v-if="isInProgress"
               class="text-caption text-center mt-1"
               :title="$t('common.read_on', {date: readProgressDate})"
          >
            {{ $tc('common.pages_left', pagesLeft) }}
          </div>
          <div v-else-if="isRead"
               class="text-caption text-center mt-1"
          >
            {{ $t('common.read_on', {date: readProgressDate}) }}
          </div>
        </v-col>

        <v-col cols="8" sm="8" md="" class="col flex-grow-1" style="min-width: 0;">
          <v-container fluid class="pa-0">
            <v-row>
              <v-col class="py-1">
                <router-link
                  :to="{name:'browse-series', params: {seriesId: book.seriesId}}"
                  class="link-underline text-h5 text-wrap"
                  style="word-break: break-word; overflow-wrap: break-word;"
                >{{ book.seriesTitle }}
                </router-link>
                <router-link
                  class="caption link-underline"
                  :class="$vuetify.breakpoint.smAndUp ? 'mx-1' : ''"
                  :style="$vuetify.breakpoint.xsOnly ? 'display: block' : ''"
                  :to="{name:'browse-libraries', params: {libraryId: book.libraryId }}"
                >{{ $t('searchbox.in_library', {library: getLibraryName(book)}) }}
                </router-link>
              </v-col>
            </v-row>
            <v-row>
              <v-col class="py-1">
                <div class="text-h6 text-wrap" style="word-break: break-word; overflow-wrap: break-word;">{{ book.metadata.title }}</div>
              </v-col>
            </v-row>

            <v-row class="text-caption" align="center">
              <v-col cols="auto" v-if="book.media.status === MediaStatus.UNKNOWN">
                {{ book.metadata.number }} · {{ $t('book_card.unknown') }}
              </v-col>

              <v-col cols="auto" v-else>
                {{ book.metadata.number }} · {{ $tc('common.pages_n', book.media.pagesCount) }}
              </v-col>

              <v-col cols="auto" v-if="book.metadata.releaseDate">
                {{
                  new Intl.DateTimeFormat($i18n.locale, {
                    dateStyle: 'long',
                    timeZone: 'UTC'
                  }).format(new Date(book.metadata.releaseDate))
                }}
              </v-col>

              <v-col class="py-1 pe-0"
                     cols="auto"
                     v-if="book.media.status === MediaStatus.OUTDATED">
                <v-tooltip bottom :disabled="!isAdmin">
                  <template v-slot:activator="{ on }">
                    <v-chip label small color="warning" v-on="on">
                      {{ $t('common.outdated') }}
                    </v-chip>
                  </template>
                  {{ $t('browse_book.outdated_tooltip') }}
                </v-tooltip>
              </v-col>

              <v-col class="py-1 pe-0" cols="auto" v-if="unavailable">
                <v-chip label small color="error">
                  {{ $t('common.unavailable') }}
                </v-chip>
              </v-col>
            </v-row>


            <template v-if="$vuetify.breakpoint.smAndUp">
              <v-row class="align-center">
                <v-col cols="auto">
                  <v-btn color="accent"
                         small
                         :title="$t('browse_book.read_book')"
                         :to="{name: readRouteName, params: { bookId: bookId}, query: { context: context.origin, contextId: context.id}}"
                         :disabled="!canRead"
                  >
                    <v-icon left small>mdi-book-open-page-variant</v-icon>
                    {{ $t('common.read') }}
                  </v-btn>
                </v-col>

                <v-col cols="auto">
                  <v-btn small
                         :title="$t('browse_book.read_incognito')"
                         :to="{name: readRouteName, params: { bookId: bookId}, query: { context: context.origin, contextId: context.id, incognito: true}}"
                         :disabled="!canRead"
                  >
                    <v-icon left small>mdi-incognito</v-icon>
                    {{ $t('common.read') }}
                  </v-btn>
                </v-col>

                <v-col cols="auto">
                  <v-btn :title="$t('browse_book.download_file')"
                         small
                         :disabled="!canDownload"
                         :href="fileUrl">
                    <v-icon left small>mdi-file-download</v-icon>
                    {{ $t('common.download') }}
                  </v-btn>
                </v-col>

                <v-col cols="auto" v-if="isPdf">
                  <v-btn :title="$t('browse_book.pdf_toc')"
                         small
                         :disabled="!canRead || pdfTocLoading"
                         @click="togglePdfToc">
                    <v-icon left small>mdi-table-of-contents</v-icon>
                    {{ $t('browse_book.pdf_toc') }}
                  </v-btn>
                </v-col>
              </v-row>

              <v-row v-if="book.metadata.summary">
                <v-col>
                  <read-more v-model="readMore">{{ book.metadata.summary }}</read-more>
                </v-col>
              </v-row>
            </template>
          </v-container>
        </v-col>
      </v-row>

      <template v-if="$vuetify.breakpoint.xsOnly">
        <v-row class="align-center">
          <v-col cols="auto">
            <v-btn color="accent"
                   small
                   :title="$t('browse_book.read_book')"
                   :to="{name: readRouteName, params: { bookId: bookId}, query: { context: context.origin, contextId: context.id}}"
                   :disabled="!canRead"
            >
              <v-icon left small>mdi-book-open-page-variant</v-icon>
              {{ $t('common.read') }}
            </v-btn>
          </v-col>

          <v-col cols="auto">
            <v-btn small
                   :title="$t('browse_book.read_incognito')"
                   :to="{name: readRouteName, params: { bookId: bookId}, query: { context: context.origin, contextId: context.id, incognito: true}}"
                   :disabled="!canRead"
            >
              <v-icon left small>mdi-incognito</v-icon>
              {{ $t('common.read') }}
            </v-btn>
          </v-col>

          <v-col cols="auto">
            <v-btn :title="$t('browse_book.download_file')"
                   small
                   :disabled="!canDownload"
                   :href="fileUrl">
              <v-icon left small>mdi-file-download</v-icon>
              {{ $t('common.download') }}
            </v-btn>
          </v-col>

          <v-col cols="auto" v-if="isPdf">
            <v-btn :title="$t('browse_book.pdf_toc')"
                   small
                   :disabled="!canRead || pdfTocLoading"
                   @click="togglePdfToc">
              <v-icon left small>mdi-table-of-contents</v-icon>
              {{ $t('browse_book.pdf_toc') }}
            </v-btn>
          </v-col>
        </v-row>

        <v-row v-if="book.metadata.summary">
          <v-col>
            <read-more v-model="readMore">{{ book.metadata.summary }}</read-more>
          </v-col>
        </v-row>
      </template>

      <v-expand-transition>
        <v-row v-if="showPdfToc && isPdf">
          <v-col cols="12" md="8" lg="6">
            <v-card outlined>
              <v-toolbar dense flat>
                <v-toolbar-title class="text-body-1">{{ $t('browse_book.pdf_toc') }}</v-toolbar-title>
                <v-spacer />
                <template v-if="!pdfTocEditing">
                  <v-btn
                    icon
                    :disabled="pdfTocLoading || pdfTocSaving"
                    :aria-label="$t('browse_book.pdf_toc_edit')"
                    :title="$t('browse_book.pdf_toc_edit')"
                    @click="startPdfTocEditing"
                  >
                    <v-icon>mdi-pencil</v-icon>
                  </v-btn>
                  <v-menu offset-y>
                    <template v-slot:activator="{on, attrs}">
                      <v-btn
                        icon
                        v-bind="attrs"
                        v-on="on"
                        :aria-label="$t('browse_book.pdf_toc_file_options')"
                      >
                        <v-icon>mdi-dots-vertical</v-icon>
                      </v-btn>
                    </template>
                    <v-list dense>
                      <v-list-item :disabled="pdfTocLoading || pdfTocSaving" @click="exportPdfToc">
                        <v-list-item-icon><v-icon small>mdi-download</v-icon></v-list-item-icon>
                        <v-list-item-title>{{ $t('browse_book.pdf_toc_export') }}</v-list-item-title>
                      </v-list-item>
                      <v-list-item :disabled="pdfTocLoading || pdfTocSaving" @click="$refs.pdfTocImport.click()">
                        <v-list-item-icon><v-icon small>mdi-upload</v-icon></v-list-item-icon>
                        <v-list-item-title>{{ $t('browse_book.pdf_toc_import') }}</v-list-item-title>
                      </v-list-item>
                    </v-list>
                  </v-menu>
                </template>
                <template v-else>
                  <v-btn icon :aria-label="$t('browse_book.pdf_toc_add')" :title="$t('browse_book.pdf_toc_add')" @click="addPdfTocEntry()">
                    <v-icon>mdi-plus</v-icon>
                  </v-btn>
                  <v-btn text :loading="pdfTocSaving" @click="savePdfTocEditing">
                    {{ $t('browse_book.pdf_toc_save') }}
                  </v-btn>
                  <v-btn icon :aria-label="$t('browse_book.pdf_toc_cancel')" :title="$t('browse_book.pdf_toc_cancel')" @click="cancelPdfTocEditing">
                    <v-icon>mdi-close</v-icon>
                  </v-btn>
                </template>
                <input
                  ref="pdfTocImport"
                  type="file"
                  accept="application/json,.json"
                  hidden
                  @change="importPdfToc"
                />
              </v-toolbar>
              <v-alert v-if="pdfTocError" type="error" text dense class="ma-3">
                {{ pdfTocError }}
              </v-alert>
              <v-progress-linear v-if="pdfTocLoading || pdfTocSaving" indeterminate color="primary" />
              <v-list v-else-if="pdfTocEditing" dense class="pdf-toc-editor-list">
                <v-list-item
                  v-for="row in pdfTocDraftRows"
                  :key="row.path.join('-')"
                  class="pdf-toc-editor-row"
                  @click="focusPdfTocEntry(row.path)"
                >
                  <v-btn
                    v-if="row.entry.children && row.entry.children.length"
                    icon
                    small
                    class="pdf-toc-editor-toggle"
                    :aria-label="$t('browse_book.pdf_toc_focus')"
                    :title="$t('browse_book.pdf_toc_focus')"
                    @click.stop="focusPdfTocEntry(row.path)"
                  >
                    <v-icon small>{{ isPdfTocPathExpanded(row.path) ? 'mdi-chevron-down' : 'mdi-chevron-right' }}</v-icon>
                  </v-btn>
                  <div class="pdf-toc-editor-indent" :style="{width: `${row.depth * 20}px`}" />
                  <v-text-field
                    v-model="row.entry.title"
                    dense
                    hide-details
                    :label="$t('browse_book.pdf_toc_title')"
                    class="mr-2"
                  />
                  <v-text-field
                    v-model.number="row.entry.page"
                    dense
                    hide-details
                    type="number"
                    min="1"
                    :max="book.media.pagesCount"
                    :label="$t('browse_book.pdf_toc_page')"
                    class="pdf-toc-page-field mr-1"
                  />
                  <v-btn icon small :disabled="row.path[row.path.length - 1] === 0" aria-label="Move up" @click="movePdfTocEntry(row.path, -1)">
                    <v-icon small>mdi-arrow-up</v-icon>
                  </v-btn>
                  <v-btn icon small aria-label="Move down" @click="movePdfTocEntry(row.path, 1)">
                    <v-icon small>mdi-arrow-down</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    small
                    :aria-label="$t('browse_book.pdf_toc_add_child')"
                    :title="$t('browse_book.pdf_toc_add_child')"
                    @click="addPdfTocEntry(row.path)"
                  >
                    <v-icon small>mdi-plus</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    small
                    :disabled="row.path[row.path.length - 1] === 0"
                    :aria-label="$t('browse_book.pdf_toc_indent')"
                    :title="$t('browse_book.pdf_toc_indent')"
                    @click="indentPdfTocEntry(row.path)"
                  >
                    <v-icon small>mdi-arrow-right</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    small
                    :disabled="row.path.length < 2"
                    :aria-label="$t('browse_book.pdf_toc_outdent')"
                    :title="$t('browse_book.pdf_toc_outdent')"
                    @click="outdentPdfTocEntry(row.path)"
                  >
                    <v-icon small>mdi-arrow-left</v-icon>
                  </v-btn>
                  <v-btn icon small aria-label="Delete entry" @click="removePdfTocEntry(row.path)">
                    <v-icon small>mdi-delete</v-icon>
                  </v-btn>
                </v-list-item>
                <v-btn v-if="pdfTocDraftRows.length === 0" text class="ma-4" @click="addPdfTocEntry()">
                  <v-icon left>mdi-plus</v-icon>{{ $t('browse_book.pdf_toc_add') }}
                </v-btn>
              </v-list>
              <toc-list
                v-else-if="pdfTocFlattened.length > 0"
                :toc="pdfTocFlattened"
                @goto="goToPdfTocEntry"
              />
              <v-alert v-else type="info" text dense class="ma-3">
                <div>{{ $t('browse_book.pdf_toc_empty') }}</div>
                <v-btn small text class="mt-2" @click="startPdfTocEditing(); addPdfTocEntry()">
                  <v-icon left small>mdi-plus</v-icon>{{ $t('browse_book.pdf_toc_add') }}
                </v-btn>
              </v-alert>
            </v-card>
          </v-col>
        </v-row>
      </v-expand-transition>

      <v-row v-for="role in displayedRoles"
             :key="role"
             class="align-center text-caption"
      >
        <v-col cols="4" sm="3" md="2" xl="1" class="py-1 text-uppercase">
          {{ $te(`author_roles.${role}`) ? $t(`author_roles.${role}`) : role }}
        </v-col>
        <v-col cols="8" sm="9" md="10" xl="11" class="py-1">
          <vue-horizontal>
            <template v-slot:btn-prev>
              <v-btn icon small>
                <v-icon>mdi-chevron-left</v-icon>
              </v-btn>
            </template>

            <template v-slot:btn-next>
              <v-btn icon small>
                <v-icon>mdi-chevron-right</v-icon>
              </v-btn>
            </template>
            <v-chip v-for="(name, i) in authorsByRole[role]"
                    :key="i"
                    class="me-2"
                    :title="name"
                    :to="{name:'browse-series', params: {seriesId: book.seriesId }, query: {[role]: [name]}}"
                    label
                    small
                    outlined
                    link
            >{{ name }}
            </v-chip>
          </vue-horizontal>
        </v-col>
      </v-row>

      <v-row v-if="book.metadata.tags.length > 0" class="align-center text-caption">
        <v-col cols="4" sm="3" md="2" xl="1" class="py-1 text-uppercase">{{ $i18n.t('common.tags') }}</v-col>
        <v-col cols="8" sm="9" md="10" xl="11" class="py-1 text-capitalize">
          <vue-horizontal>
            <template v-slot:btn-prev>
              <v-btn icon small>
                <v-icon>mdi-chevron-left</v-icon>
              </v-btn>
            </template>

            <template v-slot:btn-next>
              <v-btn icon small>
                <v-icon>mdi-chevron-right</v-icon>
              </v-btn>
            </template>
            <v-chip v-for="(t, i) in book.metadata.tags"
                    :key="i"
                    class="me-2"
                    :title="t"
                    :to="{name:'browse-series', params: {seriesId: book.seriesId}, query: {tag: [new SearchConditionTag(new SearchOperatorIs(t))]}}"
                    label
                    small
                    outlined
                    link
            >{{ t }}
            </v-chip>
          </vue-horizontal>
        </v-col>
      </v-row>

      <v-row>
        <v-col>
          <read-lists-expansion-panels :read-lists="readLists">
            <template v-slot:prepend="props">
              <v-tooltip bottom>
                <template v-slot:activator="{ on }">
                  <v-btn icon class="me-2" v-on="on" @click="removeFromReadList(props.readlist.id)">
                    <v-icon>mdi-book-remove</v-icon>
                  </v-btn>
                </template>
                <span>{{ $t('browse_book.remove_from_readlist') }}</span>
              </v-tooltip>
            </template>
          </read-lists-expansion-panels>
        </v-col>
      </v-row>

      <v-row v-if="book.metadata.links.length > 0" class="align-center text-caption">
        <v-col class="py-1 text-uppercase" cols="4" sm="3" md="2" xl="1">{{ $t('browse_book.links') }}</v-col>
        <v-col class="py-1" cols="8" sm="9" md="10" xl="11">
          <v-chip
            v-for="(link, i) in book.metadata.links"
            :href="link.url"
            rel="noreferrer"
            target="_blank"
            class="me-2"
            label
            small
            outlined
            link
            :key="i"
          >
            {{ link.label }}
            <v-icon
              x-small
              color="grey"
              class="ps-1"
            >
              mdi-open-in-new
            </v-icon>
          </v-chip>
        </v-col>
      </v-row>

      <v-row class="align-center text-caption">
        <v-col class="py-1 text-uppercase" cols="4" sm="3" md="2" xl="1">{{ $t('browse_book.size') }}</v-col>
        <v-col class="py-1" cols="8" sm="9" md="10" xl="11">{{ book.size }}</v-col>
      </v-row>

      <v-row v-if="book.media.comment" class="align-center text-caption">
        <v-col class="py-1 text-uppercase" cols="4" sm="3" md="2" xl="1">{{ $t('browse_book.comment') }}</v-col>
        <v-col class="py-1 error--text font-weight-bold" cols="8" sm="9" md="10" xl="11">{{ mediaComment }}</v-col>
      </v-row>

      <v-row v-if="mediaAnalysisDate" class="align-center text-caption">
        <v-col class="py-1 text-uppercase" cols="4" sm="3" md="2" xl="1">{{ $t('browse_book.analysis_date') }}</v-col>
        <v-col class="py-1" cols="8" sm="9" md="10" xl="11">{{ mediaAnalysisDate }}</v-col>
      </v-row>

      <v-row class="align-center text-caption">
        <v-col class="py-1 text-uppercase" cols="4" sm="3" md="2" xl="1">{{ $t('browse_book.format') }}</v-col>
        <v-col class="py-1" cols="8" sm="9" md="10" xl="11">{{ format.type }}</v-col>
      </v-row>

      <v-row v-if="book.metadata.isbn" class="align-center text-caption">
        <v-col class="py-1 text-uppercase" cols="4" sm="3" md="2" xl="1">{{ $t('browse_book.isbn') }}</v-col>
        <v-col class="py-1" cols="8" sm="9" md="10" xl="11">{{ book.metadata.isbn }}</v-col>
      </v-row>

      <v-row class="align-center text-caption">
        <v-col class="py-1 text-uppercase" cols="4" sm="3" md="2" xl="1">{{ $t('browse_book.file') }}</v-col>
        <v-col class="py-1" cols="8" sm="9" md="10" xl="11">{{ book.url }}</v-col>
      </v-row>

      <v-row class="align-center text-caption">
        <v-col class="py-1 text-uppercase" cols="4" sm="3" md="2" xl="1">{{ $t('browse_book.date_created') }}</v-col>
        <v-col class="py-1" cols="8" sm="9" md="10" xl="11">{{
            new Intl.DateTimeFormat($i18n.locale, {
              dateStyle: 'long',
              timeStyle: 'short'
            }).format(new Date(book.created))
          }}
        </v-col>
      </v-row>

      <v-row class="align-center text-caption">
        <v-col class="py-1 text-uppercase" cols="4" sm="3" md="2" xl="1">{{ $t('browse_book.date_modified') }}</v-col>
        <v-col class="py-1" cols="8" sm="9" md="10" xl="11">{{
            new Intl.DateTimeFormat($i18n.locale, {
              dateStyle: 'long',
              timeStyle: 'short'
            }).format(new Date(book.lastModified))
          }}
        </v-col>
      </v-row>

    </v-container>

  </div>
</template>

<script lang="ts">
import BookActionsMenu from '@/components/menus/BookActionsMenu.vue'
import ItemCard from '@/components/ItemCard.vue'
import ToolbarSticky from '@/components/bars/ToolbarSticky.vue'
import {groupAuthorsByRole} from '@/functions/authors'
import {getBookFormatFromMedia, getBookReadRouteFromMedia} from '@/functions/book-format'
import {getPagesLeft, getReadProgress, getReadProgressPercentage} from '@/functions/book-progress'
import {getBookTitleCompact} from '@/functions/book-title'
import {bookFileUrl, bookPageUrl, bookThumbnailUrl} from '@/functions/urls'
import {MediaStatus, ReadStatus} from '@/types/enum-books'
import {
  BOOK_CHANGED,
  BOOK_DELETED,
  LIBRARY_DELETED,
  READLIST_ADDED,
  READLIST_CHANGED,
  READLIST_DELETED,
  READPROGRESS_CHANGED,
  READPROGRESS_DELETED,
} from '@/types/events'
import Vue from 'vue'
import ReadListsExpansionPanels from '@/components/ReadListsExpansionPanels.vue'
import {BookDto, BookFormat} from '@/types/komga-books'
import {Context, ContextOrigin} from '@/types/context'
import ReadMore from '@/components/ReadMore.vue'
import VueHorizontal from 'vue-horizontal'
import {authorRoles} from '@/types/author-roles'
import {convertErrorCodes} from '@/functions/error-codes'
import RtlIcon from '@/components/RtlIcon.vue'
import {BookSseDto, LibrarySseDto, ReadListSseDto, ReadProgressSseDto} from '@/types/komga-sse'
import {RawLocation} from 'vue-router/types/router'
import {ReadListDto} from '@/types/komga-readlists'
import {BookSearch, SearchConditionSeriesId, SearchConditionTag, SearchOperatorIs} from '@/types/komga-search'
import TocList from '@/components/TocList.vue'
import {TocEntry} from '@/types/epub'
import {flattenToc} from '@/functions/toc'
import {
  buildPdfTocFromDraft,
  clonePdfTocDraft,
  createPdfTocDraft,
  indentPdfTocDraft,
  outdentPdfTocDraft,
  flattenPdfTocDraft,
  normalizePdfTocDraft,
  PdfTocDraftEntry,
} from '@/functions/pdf-toc'
import {CLIENT_SETTING, ClientSettingUserUpdateDto} from '@/types/komga-clientsettings'

export default Vue.extend({
  name: 'BrowseBook',
  components: {ReadMore, ToolbarSticky, ItemCard, BookActionsMenu, ReadListsExpansionPanels, VueHorizontal, RtlIcon, TocList},
  data: () => {
    return {
      MediaStatus,
      SearchConditionTag,
      SearchOperatorIs,
      book: {} as BookDto,
      context: {} as Context,
      contextName: '',
      siblings: [] as BookDto[],
      siblingPrevious: {} as BookDto,
      siblingNext: {} as BookDto,
      readLists: [] as ReadListDto[],
      readMore: false,
      showPdfToc: false,
      pdfTocLoading: false,
      pdfTocLoaded: false,
      pdfTocEditing: false,
      pdfTocSaving: false,
      pdfTocError: '',
      pdfTocDraft: [] as PdfTocDraftEntry[],
      pdfTocActivePath: undefined as number[] | undefined,
      pdfTocOverrides: {} as Record<string, PdfTocDraftEntry[]>,
      pdfTocRequestId: 0,
      pdfToc: [] as TocEntry[],
    }
  },
  async created() {
    this.loadBook(this.bookId)
    this.$eventHub.$on(BOOK_CHANGED, this.bookChanged)
    this.$eventHub.$on(BOOK_DELETED, this.bookDeleted)
    this.$eventHub.$on(READPROGRESS_CHANGED, this.readProgressChanged)
    this.$eventHub.$on(READPROGRESS_DELETED, this.readProgressChanged)
    this.$eventHub.$on(LIBRARY_DELETED, this.libraryDeleted)
    this.$eventHub.$on(READLIST_ADDED, this.readListChanged)
    this.$eventHub.$on(READLIST_CHANGED, this.readListChanged)
    this.$eventHub.$on(READLIST_DELETED, this.readListChanged)
  },
  beforeDestroy() {
    this.$eventHub.$off(BOOK_CHANGED, this.bookChanged)
    this.$eventHub.$off(BOOK_DELETED, this.bookDeleted)
    this.$eventHub.$off(READPROGRESS_CHANGED, this.readProgressChanged)
    this.$eventHub.$off(READPROGRESS_DELETED, this.readProgressChanged)
    this.$eventHub.$off(LIBRARY_DELETED, this.libraryDeleted)
    this.$eventHub.$off(READLIST_ADDED, this.readListChanged)
    this.$eventHub.$off(READLIST_CHANGED, this.readListChanged)
    this.$eventHub.$off(READLIST_DELETED, this.readListChanged)
  },
  props: {
    bookId: {
      type: String,
      required: true,
    },
  },
  async beforeRouteUpdate(to, from, next) {
    if (to.params.bookId !== from.params.bookId) {
      this.readMore = false
      this.showPdfToc = false
      this.pdfTocLoading = false
      this.pdfTocSaving = false
      this.pdfTocLoaded = false
      this.pdfTocEditing = false
      this.pdfTocError = ''
      this.pdfTocDraft = []
      this.pdfTocActivePath = undefined
      this.pdfToc = []
      this.loadBook(to.params.bookId)
    }

    next()
  },
  computed: {
    readRouteName(): string {
      return getBookReadRouteFromMedia(this.book.media)
    },
    isPdf(): boolean {
      return this.book.media?.mediaProfile === 'PDF'
    },
    pdfTocFlattened(): TocEntry[] {
      return flattenToc(this.pdfToc, 1)
    },
    pdfTocDraftRows() {
      return flattenPdfTocDraft(this.pdfTocDraft, this.pdfTocActivePath)
    },
    isAdmin(): boolean {
      return this.$store.getters.meAdmin
    },
    unavailable(): boolean {
      return this.book.deleted || this.$store.getters.getLibraryById(this.book.libraryId).unavailable
    },
    canRead(): boolean {
      return this.book.media.status === 'READY' && this.$store.getters.mePageStreaming && !this.unavailable
    },
    canDownload(): boolean {
      return this.$store.getters.meFileDownload && !this.unavailable
    },
    thumbnailUrl(): string {
      return bookThumbnailUrl(this.bookId)
    },
    bookFilename(): string {
      const rawName = this.book.url.split(/[\\/]/).pop() || this.book.name
      const extMatch = rawName.match(/(\.[^.]+)$/)
      const ext = extMatch ? extMatch[1] : ''
      const title = (this.book.metadata?.title || '').replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_').trim().replace(/\.+$/, '')
      if (!title) return rawName
      if (ext && title.toLowerCase().endsWith(ext.toLowerCase())) return title
      return `${title}${ext}`
    },
    fileUrl(): string {
      return bookFileUrl(this.bookId, this.bookFilename)
    },
    format(): BookFormat {
      return getBookFormatFromMedia(this.book.media)
    },
    authorsByRole(): any {
      return groupAuthorsByRole(this.book.metadata.authors)
    },
    isRead(): boolean {
      return getReadProgress(this.book) === ReadStatus.READ
    },
    isUnread(): boolean {
      return getReadProgress(this.book) === ReadStatus.UNREAD
    },
    isInProgress(): boolean {
      return getReadProgress(this.book) === ReadStatus.IN_PROGRESS
    },
    pagesLeft(): number {
      return getPagesLeft(this.book)
    },
    readProgressPercentage(): number {
      return getReadProgressPercentage(this.book)
    },
    readProgressDate(): string | undefined {
      if (this.book.readProgress)
        return new Intl.DateTimeFormat(this.$i18n.locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
        } as Intl.DateTimeFormatOptions).format(this.book.readProgress.readDate)
      return undefined
    },
    previousId(): string {
      return this.siblingPrevious?.id?.toString() || '0'
    },
    nextId(): string {
      return this.siblingNext?.id?.toString() || '0'
    },
    contextReadList(): boolean {
      return this.context.origin === ContextOrigin.READLIST
    },
    mediaComment(): string {
      return convertErrorCodes(this.book.media.comment)
    },
    mediaAnalysisDate(): string | undefined {
      if (this.book.media.status !== 'ERROR' || !this.book.media.lastModified) return undefined
      return new Intl.DateTimeFormat(
        this.$i18n.locale,
        {
          dateStyle: 'medium',
          timeStyle: 'short',
        } as Intl.DateTimeFormatOptions,
      ).format(new Date(this.book.media.lastModified))
    },
    parentLocation(): RawLocation {
      if (this.contextReadList)
        return {name: 'browse-readlist', params: {readListId: this.context.id}}
      else
        return {name: 'browse-series', params: {seriesId: this.book.seriesId}}
    },
    displayedRoles(): string[] {
      const allRoles = this.$_.uniq([...authorRoles, ...(this.book.metadata.authors.map(x => x.role))])
      return allRoles.filter(x => this.authorsByRole[x])
    },
  },
  methods: {
    getLibraryName(item: BookDto): string {
      return this.$store.getters.getLibraryById(item.libraryId).name
    },
    libraryDeleted(event: LibrarySseDto) {
      if (event.libraryId === this.book.libraryId) {
        this.$router.push({name: 'home'})
      }
    },
    readListChanged(event: ReadListSseDto) {
      if (event.bookIds.includes(this.bookId) || this.readLists.map(x => x.id).includes(event.readListId)) {
        this.$komgaBooks.getReadLists(this.bookId)
          .then(v => this.readLists = v)
      }
    },
    bookChanged(event: BookSseDto) {
      if (event.bookId === this.bookId) this.loadBook(this.bookId)
    },
    bookDeleted(event: BookSseDto) {
      if (event.bookId === this.bookId) {
        this.$router.push({name: 'browse-series', params: {seriesId: this.book.seriesId}})
      }
    },
    readProgressChanged(event: ReadProgressSseDto) {
      if (event.bookId === this.bookId) this.loadBook(this.bookId)
    },
    async loadBook(bookId: string) {
      this.book = await this.$komgaBooks.getBook(bookId)
      // for the cases where we can't change the origin target route because we don't have the full BookDto
      if (this.book.oneshot) await this.$router.replace({
        name: 'browse-oneshot',
        params: {seriesId: this.book.seriesId},
      })

      // parse query params to get context and contextId
      if (this.$route.query.contextId && this.$route.query.context
        && Object.values(ContextOrigin).includes(this.$route.query.context as ContextOrigin)) {
        this.context = {
          origin: this.$route.query.context as ContextOrigin,
          id: this.$route.query.contextId as string,
        }
        this.book.context = this.context
        this.$komgaReadLists.getOneReadList(this.context.id)
          .then(v => this.contextName = v.name)
      }

      // Get siblings depending on origin
      if (this?.context.origin === ContextOrigin.READLIST) {
        this.$komgaReadLists.getBooks(this.context.id, {unpaged: true} as PageRequest)
          .then(v => this.siblings = v.content)
      } else {
        this.$komgaBooks.getBooksList({
          condition: new SearchConditionSeriesId(new SearchOperatorIs(this.book.seriesId)),
        } as BookSearch, {unpaged: true, sort: ['metadata.numberSort']})
          .then(v => this.siblings = v.content)
      }

      this.$komgaBooks.getReadLists(this.bookId)
        .then(v => this.readLists = v)

      if (this.$_.has(this.book, 'metadata.title')) {
        document.title = `Komga - ${getBookTitleCompact(this.book.metadata.title, this.book.seriesTitle, this.book.oneshot ? undefined : this.book.metadata.number)}`
      }

      if (this?.context.origin === ContextOrigin.READLIST) {
        this.$komgaReadLists.getBookSiblingNext(this.context.id, bookId)
          .then(v => this.siblingNext = v)
          .catch(e => this.siblingNext = {} as BookDto)
      } else {
        this.$komgaBooks.getBookSiblingNext(bookId)
          .then(v => this.siblingNext = v)
          .catch(e => this.siblingNext = {} as BookDto)
      }
      if (this?.context.origin === ContextOrigin.READLIST) {
        this.$komgaReadLists.getBookSiblingPrevious(this.context.id, bookId)
          .then(v => this.siblingPrevious = v)
          .catch(e => this.siblingPrevious = {} as BookDto)
      } else {
        this.$komgaBooks.getBookSiblingPrevious(bookId)
          .then(v => this.siblingPrevious = v)
          .catch(e => this.siblingPrevious = {} as BookDto)
      }
    },
    async analyze() {
      await this.$komgaBooks.analyzeBook(this.book)
      this.refreshAfterAnalyze()
    },
    refreshAfterAnalyze() {
      setTimeout(() => this.loadBook(this.bookId), 1500)
    },
    refreshMetadata() {
      this.$komgaBooks.refreshMetadata(this.book)
    },
    editBook() {
      this.$store.dispatch('dialogUpdateBooks', this.book)
    },
    async togglePdfToc() {
      this.showPdfToc = !this.showPdfToc
      if (this.showPdfToc && !this.pdfTocLoaded) {
        await this.loadPdfToc()
      }
    },
    async loadPdfToc() {
      const bookId = this.bookId
      const requestId = ++this.pdfTocRequestId
      this.pdfTocLoading = true
      this.pdfTocError = ''
      try {
        await this.$store.dispatch('getClientSettingsUser')
        if (this.bookId !== bookId || this.pdfTocRequestId !== requestId) return
        const overrides = this.readServerPdfTocOverrides()
        const manifest = await this.$komgaBooks.getBookWebPubManifestPdf(bookId)
        if (this.bookId !== bookId || this.pdfTocRequestId !== requestId) return
        this.pdfTocOverrides = overrides
        this.pdfToc = overrides[bookId]
          ? this.buildPdfToc(overrides[bookId], bookId)
          : manifest.toc || []
        this.pdfTocLoaded = true
      } catch (e) {
        if (this.pdfTocRequestId === requestId) this.pdfTocError = e instanceof Error ? e.message : String(e)
      } finally {
        if (this.pdfTocRequestId === requestId) this.pdfTocLoading = false
      }
    },
    pdfTocStorageKey(): string {
      return CLIENT_SETTING.WEBUI_PDF_TOC_OVERRIDES
    },
    readServerPdfTocOverrides(): Record<string, PdfTocDraftEntry[]> {
      try {
        const value = this.$store.state.komgaSettings.clientSettingsUser[this.pdfTocStorageKey()]?.value
        return value ? JSON.parse(value) : {}
      } catch (e) {
        return {}
      }
    },
    buildPdfToc(entries: PdfTocDraftEntry[], bookId: string = this.bookId): TocEntry[] {
      return buildPdfTocFromDraft<TocEntry>(entries, page => bookPageUrl(bookId, page))
    },
    startPdfTocEditing() {
      this.pdfTocDraft = clonePdfTocDraft(createPdfTocDraft(this.pdfToc, entry => this.getPageFromPdfTocEntry(entry as TocEntry)))
      this.pdfTocActivePath = undefined
      this.pdfTocEditing = true
      this.pdfTocError = ''
    },
    cancelPdfTocEditing() {
      this.pdfTocEditing = false
      this.pdfTocError = ''
      this.pdfTocDraft = []
      this.pdfTocActivePath = undefined
    },
    focusPdfTocEntry(path: number[]) {
      this.pdfTocActivePath = [...path]
    },
    isPdfTocPathExpanded(path: number[]): boolean {
      if (!this.pdfTocActivePath) return true
      return this.pdfTocActivePath.every((index, depth) => path[depth] === index)
        || path.every((index, depth) => this.pdfTocActivePath?.[depth] === index)
    },
    pdfTocEntryAt(path: number[]): PdfTocDraftEntry | undefined {
      let list = this.pdfTocDraft
      let entry: PdfTocDraftEntry | undefined
      path.forEach(index => {
        entry = list[index]
        list = entry?.children || []
      })
      return entry
    },
    pdfTocListAt(parentPath: number[]): PdfTocDraftEntry[] {
      if (parentPath.length === 0) return this.pdfTocDraft
      const parent = this.pdfTocEntryAt(parentPath)
      if (!parent) return []
      if (!parent.children) this.$set(parent, 'children', [])
      return parent.children as PdfTocDraftEntry[]
    },
    addPdfTocEntry(parentPath: number[] = []) {
      this.pdfTocListAt(parentPath).push({title: '', page: undefined})
      this.pdfTocError = ''
    },
    removePdfTocEntry(path: number[]) {
      this.pdfTocListAt(path.slice(0, -1)).splice(path[path.length - 1], 1)
    },
    movePdfTocEntry(path: number[], direction: number) {
      const list = this.pdfTocListAt(path.slice(0, -1))
      const index = path[path.length - 1]
      const target = index + direction
      if (target < 0 || target >= list.length) return
      const [entry] = list.splice(index, 1)
      list.splice(target, 0, entry)
    },
    indentPdfTocEntry(path: number[]) {
      this.pdfTocDraft = indentPdfTocDraft(this.pdfTocDraft, path)
      this.pdfTocError = ''
    },
    outdentPdfTocEntry(path: number[]) {
      this.pdfTocDraft = outdentPdfTocDraft(this.pdfTocDraft, path)
      this.pdfTocError = ''
    },
    async savePdfTocEditing() {
      const bookId = this.bookId
      this.pdfTocSaving = true
      this.pdfTocError = ''
      try {
        const normalized = normalizePdfTocDraft(this.pdfTocDraft, this.book.media.pagesCount, (key, values) => this.$t(key, values).toString())
        await this.savePdfTocOverrides(normalized, bookId)
        if (this.bookId !== bookId) return
        this.pdfToc = this.buildPdfToc(normalized, bookId)
        this.pdfTocDraft = clonePdfTocDraft(normalized)
        this.pdfTocEditing = false
      } catch (e) {
        if (this.bookId === bookId) this.pdfTocError = e instanceof Error ? e.message : String(e)
      } finally {
        if (this.bookId === bookId) this.pdfTocSaving = false
      }
    },
    async savePdfTocOverrides(entries: PdfTocDraftEntry[], bookId: string) {
      await this.$store.dispatch('getClientSettingsUser')
      const all = this.readServerPdfTocOverrides()
      all[bookId] = entries
      const setting = {[this.pdfTocStorageKey()]: {value: JSON.stringify(all)}} as Record<string, ClientSettingUserUpdateDto>
      await this.$komgaSettings.updateClientSettingUser(setting)
      await this.$store.dispatch('getClientSettingsUser')
      this.pdfTocOverrides = this.readServerPdfTocOverrides()
    },
    exportPdfToc() {
      const entries = this.pdfTocOverrides[this.bookId]
        || createPdfTocDraft(this.pdfToc, entry => this.getPageFromPdfTocEntry(entry as TocEntry))
      const blob = new Blob([JSON.stringify({version: 1, bookId: this.bookId, toc: entries}, null, 2)], {type: 'application/json'})
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${this.bookId}-toc.json`
      anchor.click()
      URL.revokeObjectURL(url)
    },
    async importPdfToc(event: Event) {
      const input = event.target as HTMLInputElement
      const file = input.files?.[0]
      input.value = ''
      if (!file) return
      try {
        const parsed = JSON.parse(await file.text())
        if (parsed.bookId && parsed.bookId !== this.bookId) {
          throw new Error(this.$t('browse_book.pdf_toc_book_mismatch').toString())
        }
        this.pdfTocDraft = normalizePdfTocDraft(parsed, this.book.media.pagesCount, (key, values) => this.$t(key, values).toString())
        this.pdfTocEditing = true
        this.pdfTocError = ''
      } catch (e) {
        this.pdfTocError = e instanceof Error ? e.message : String(e)
      }
    },
    goToPdfTocEntry(tocEntry: TocEntry) {
      const page = this.getPageFromPdfTocEntry(tocEntry)
      if (!page) return

      this.$router.push({
        name: this.readRouteName,
        params: {bookId: this.bookId},
        query: {page: page.toString(), context: this.context.origin, contextId: this.context.id},
      })
    },
    getPageFromPdfTocEntry(tocEntry: TocEntry): number | undefined {
      if (!tocEntry.href) return undefined

      const match = new URL(tocEntry.href, window.location.origin).pathname.match(/\/pages\/(\d+)(?:\/raw)?$/)
      return match ? Number(match[1]) : undefined
    },
    removeFromReadList(readListId: string) {
      const rl = this.readLists.find(x => x.id == readListId)
      const modified = Object.assign({}, {bookIds: rl?.bookIds.filter(x => x != this.bookId)})
      if (modified!.bookIds!.length == 0)
        this.$komgaReadLists.deleteReadList(rl!.id)
      else
        this.$komgaReadLists.patchReadList(rl!.id, modified)
    },
  },
})
</script>

<style scoped>
@media (max-width: 959px) {
  .browse-book-view {
    min-height: calc(100vh + 80px);
    padding-bottom: 96px;
  }
}
.pdf-toc-editor-list {
  max-width: 100%;
  overflow-x: auto;
}

.pdf-toc-editor-row {
  display: flex;
  align-items: center;
  min-width: 480px;
}

.pdf-toc-editor-row .v-input {
  min-width: 0;
}

.pdf-toc-editor-toggle {
  flex: 0 0 32px;
}

.pdf-toc-editor-indent {
  flex: 0 0 auto;
}

.pdf-toc-page-field {
  flex: 0 0 82px;
  max-width: 82px;
}
</style>
