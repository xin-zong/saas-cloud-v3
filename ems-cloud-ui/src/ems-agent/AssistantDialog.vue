<template>
  <transition name="assistant-dialog-fade">
    <div
      v-if="visible"
      class="assistant-dialog-overlay"
      :class="{ 'is-fullscreen': isFullscreen }"
    >
      <div
        class="assistant-dialog"
        :class="{
          'is-resizing': isDrawerResizing,
          'is-fullscreen': isFullscreen,
          'is-compact-drawer': isCompactDrawer,
          'is-roomy-drawer': isRoomyDrawer
        }"
        :style="dialogStyle"
        data-node-id="3369:7986"
      >
        <div
          v-if="canResizeDrawer"
          class="assistant-dialog__resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize Energy Copilot drawer"
          :aria-valuemin="drawerMinWidth"
          :aria-valuemax="drawerMaxWidth"
          :aria-valuenow="drawerWidthValue"
          tabindex="0"
          title="Drag to resize"
          @pointerdown.prevent="startDrawerResize"
          @keydown="handleDrawerResizeKeydown"
        />
        <div class="assistant-dialog__header" data-node-id="3369:7987">
          <div class="assistant-dialog__header-inner">
            <div class="assistant-dialog__header-brand" data-node-id="3369:7988">
              <img
                class="assistant-dialog__header-avatar"
                src="./assets/avatar.png"
                alt=""
                draggable="false"
              />
              <div class="assistant-dialog__header-title">
                <p data-node-id="3369:7989">Enerlution EMS3.0 Agent</p>
                <span>EMS 3.0</span>
              </div>
            </div>
            <div class="assistant-dialog__header-actions" data-node-id="3369:7990">
              <button
                type="button"
                class="assistant-dialog__system-btn"
                :class="{ 'is-ready': agentReady, 'is-active': systemPanelOpen }"
                :title="agentReady ? tools.length + ' tools available' : 'Agent service unavailable'"
                aria-label="Agent service and tools"
                @click="toggleSystemPanel"
              >
                <span class="assistant-dialog__system-dot" />
                <span>{{ tools.length }} tools</span>
              </button>
              <button
                type="button"
                class="assistant-dialog__history-btn"
                :class="{ 'is-active': historyPanelOpen }"
                title="Conversation history"
                aria-label="Conversation history"
                @click="toggleHistoryPanel"
              >
                <i class="el-icon-time" aria-hidden="true" />
                <span>History</span>
                <strong v-if="conversationHistory.length">{{ conversationHistory.length }}</strong>
              </button>
              <button
                type="button"
                class="assistant-dialog__header-btn"
                :class="{ 'is-active': isFullscreen }"
                :title="isFullscreen ? 'Return to drawer' : 'Open full screen'"
                :aria-label="isFullscreen ? 'Return to drawer' : 'Open Enerlution EMS3.0 Agent full screen'"
                @click="toggleFullscreen"
              >
                <i class="el-icon-full-screen" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="assistant-dialog__close-btn"
                data-node-id="3369:7991"
                title="Close"
                aria-label="Close Enerlution EMS3.0 Agent"
                @click="handleClose"
              >
                <i class="el-icon-close" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        <section
          class="assistant-dialog__context"
          :class="{ 'is-open': contextPanelOpen }"
        >
          <button
            type="button"
            class="assistant-dialog__context-summary"
            :aria-expanded="contextPanelOpen ? 'true' : 'false'"
            @click="contextPanelOpen = !contextPanelOpen"
          >
            <span class="assistant-dialog__context-label">
              <i class="el-icon-aim" aria-hidden="true" />
              <strong>Scope</strong>
            </span>
            <span
              class="assistant-dialog__context-summary-item assistant-dialog__context-summary-item--site"
              :data-agent-dynamic="selectedSiteIds.length === 1 ? 'true' : null"
              :title="selectedSiteSummary"
            >
              <i class="el-icon-office-building" aria-hidden="true" />
              {{ selectedSiteSummary }}
            </span>
            <span
              class="assistant-dialog__context-summary-item assistant-dialog__context-summary-item--time"
              :title="timeRangeSummary"
            >
              <i class="el-icon-date" aria-hidden="true" />
              {{ timeRangeSummary }}
            </span>
            <i class="el-icon-arrow-down assistant-dialog__context-chevron" aria-hidden="true" />
          </button>
          <transition name="assistant-context-panel">
            <div
              v-if="contextPanelOpen"
              class="assistant-dialog__context-controls"
            >
              <div class="assistant-dialog__context-panel-head">
                <div>
                  <strong>Context settings</strong>
                  <span>{{ selectedSiteSummary }} · {{ timeRangeSummary }}</span>
                </div>
                <button
                  type="button"
                  class="assistant-dialog__context-close"
                  title="Close analysis context"
                  aria-label="Close analysis context"
                  @click="contextPanelOpen = false"
                >
                  <i class="el-icon-close" aria-hidden="true" />
                </button>
              </div>
              <div class="assistant-dialog__context-grid">
                <section class="assistant-dialog__context-group assistant-dialog__context-group--site">
                  <label class="assistant-dialog__context-field">
                    <span>Site scope</span>
                    <el-select
                      v-model="selectedSiteIds"
                      class="assistant-dialog__site-select"
                      multiple
                      collapse-tags
                      filterable
                      clearable
                      size="mini"
                      placeholder="All sites"
                      :loading="sitesLoading"
                      loading-text="Loading sites"
                      no-match-text="No matching sites"
                      :no-data-text="siteSelectEmptyText"
                      popper-class="coliopt-context-site-popper"
                      @change="handleSiteScopeChange"
                    >
                      <el-option
                        v-for="site in siteOptions"
                        :key="site.id"
                        :label="site.label"
                        :value="site.id"
                      >
                        <span class="coliopt-context-site-option" :title="site.label">
                          <i class="el-icon-office-building" aria-hidden="true" />
                          <span class="coliopt-context-site-option__copy">
                            <strong class="coliopt-context-site-option__name">{{ site.label }}</strong>
                            <small>{{ site.id }}</small>
                          </span>
                          <i
                            v-if="selectedSiteIds.includes(site.id)"
                            class="el-icon-check coliopt-context-site-option__check"
                            aria-hidden="true"
                          />
                        </span>
                      </el-option>
                    </el-select>
                  </label>
                  <div
                    v-if="sitesLoadError || (!sitesLoading && !siteOptions.length)"
                    class="assistant-dialog__site-directory-state"
                    :class="{ 'is-error': !!sitesLoadError }"
                  >
                    <i :class="sitesLoadError ? 'el-icon-warning-outline' : 'el-icon-office-building'" aria-hidden="true" />
                    <span>{{ sitesLoadError || 'No accessible sites' }}</span>
                    <button v-if="sitesLoadError" type="button" @click.prevent="refreshSites">
                      Retry
                    </button>
                  </div>
                </section>
                <section class="assistant-dialog__context-group assistant-dialog__context-group--time">
                  <div class="assistant-dialog__context-section-row">
                    <span class="assistant-dialog__context-section-label">Time range</span>
                    <small>{{ timeRangeSummary }}</small>
                  </div>
                  <div class="assistant-dialog__context-range">
                    <label class="assistant-dialog__context-field">
                      <span>Start</span>
                      <input v-model="timeStart" type="datetime-local" @change="handleContextSettingsChange" />
                    </label>
                    <label class="assistant-dialog__context-field">
                      <span>End</span>
                      <input v-model="timeEnd" type="datetime-local" @change="handleContextSettingsChange" />
                    </label>
                  </div>
                  <div class="assistant-dialog__context-presets" aria-label="Time range shortcuts">
                    <button
                      v-for="preset in timeRangePresets"
                      :key="preset.value"
                      type="button"
                      :title="preset.title"
                      @click="applyTimeRangePreset(preset.value)"
                    >
                      {{ preset.label }}
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </transition>
        </section>

        <div
          class="assistant-dialog__content"
          :class="{
            'is-chat': phase !== 'welcome',
            'has-history': historyPanelOpen,
            'has-system': systemPanelOpen
          }"
          data-node-id="3369:7994"
        >
          <section
            v-if="systemPanelOpen"
            class="assistant-dialog__system-panel"
            aria-label="Agent service and tools"
          >
            <div class="assistant-dialog__system-head">
              <div>
                <h3>Agent status</h3>
                <p>{{ modelLabel }}</p>
              </div>
              <button type="button" title="Close" aria-label="Close Agent status" @click="systemPanelOpen = false">
                <i class="el-icon-close" aria-hidden="true" />
              </button>
            </div>
            <div class="assistant-dialog__system-statuses">
              <span :class="{ 'is-ok': agentReady }">Agent {{ agentReady ? 'online' : 'unavailable' }}</span>
              <span :class="{ 'is-ok': ragReady }">RAG {{ ragReady ? 'ready' : 'unavailable' }}</span>
              <span :class="{ 'is-ok': tools.length >= 24 }">{{ tools.length }} tools</span>
            </div>
            <input v-model="toolSearch" type="search" placeholder="Search tools" />
            <div class="assistant-dialog__system-tools">
              <div v-for="tool in filteredTools" :key="toolDisplayName(tool)">
                <strong>{{ toolDisplayName(tool) }}</strong>
                <span>{{ tool.risk_level || tool.riskLevel || 'L1' }}</span>
                <p>{{ toolDescription(tool) }}</p>
              </div>
              <p v-if="!filteredTools.length" class="assistant-dialog__system-empty">No matching tools</p>
            </div>
          </section>

          <section
            v-if="historyPanelOpen"
            class="assistant-dialog__history-panel"
            aria-label="Conversation history"
          >
            <div class="assistant-dialog__history-head">
              <div>
                <h3>History</h3>
                <p>{{ conversationHistory.length }} saved conversations</p>
              </div>
              <button
                type="button"
                class="assistant-dialog__history-close"
                aria-label="Close history"
                title="Close"
                @click="closeHistoryPanel"
              >
                <i class="el-icon-close" aria-hidden="true" />
              </button>
            </div>

            <div v-if="!conversationHistory.length" class="assistant-dialog__history-empty">
              <strong>No conversations yet</strong>
              <p>Conversations are saved locally after you send a message.</p>
            </div>

            <div v-else class="assistant-dialog__history-list">
              <article
                v-for="item in conversationHistory"
                :key="item.id"
                class="assistant-dialog__history-item"
                :class="{ 'is-active': isCurrentHistoryItem(item) }"
              >
                <button
                  type="button"
                  class="assistant-dialog__history-main"
                  :disabled="isStreaming"
                  @click="openHistoryConversation(item)"
                >
                  <span class="assistant-dialog__history-title" :title="item.title">{{ item.title }}</span>
                  <span class="assistant-dialog__history-meta">
                    {{ formatHistoryTime(item.updatedAt) }} · {{ item.messages.length }} messages
                  </span>
                  <span class="assistant-dialog__history-preview">{{ getHistoryPreview(item) }}</span>
                </button>
                <div class="assistant-dialog__history-actions">
                  <button
                    type="button"
                    class="assistant-dialog__history-action"
                    :disabled="isStreaming"
                    @click="openHistoryConversation(item)"
                  >
                    {{ isCurrentHistoryItem(item) ? 'Current' : 'Open' }}
                  </button>
                  <button
                    type="button"
                    class="assistant-dialog__history-action assistant-dialog__history-action--danger"
                    :disabled="isStreaming"
                    @click="deleteHistoryConversation(item)"
                  >
                    Delete
                  </button>
                </div>
              </article>
            </div>
          </section>

          <div v-if="phase === 'welcome'" class="assistant-dialog__welcome">
            <section class="assistant-dialog__welcome-hero">
              <img
                class="assistant-dialog__avatar"
                src="./assets/avatar.png"
                alt=""
                draggable="false"
                data-node-id="3369:8039"
              />
              <div class="assistant-dialog__welcome-copy">
                <div class="assistant-dialog__greeting" data-node-id="3369:7996">
                  <p data-node-id="3369:7997">
                    <span class="assistant-dialog__greeting-normal">Hi, I'm the </span>
                    <span class="assistant-dialog__greeting-highlight">Enerlution EMS3.0 Agent</span>
                  </p>
                </div>
                <div class="assistant-dialog__subtitle" data-node-id="3369:7998">
                  <p data-node-id="3369:7999">How can I help with today's operations?</p>
                </div>
              </div>
            </section>
            <div class="assistant-dialog__presets" data-node-id="3369:8000">
            <div class="assistant-dialog__presets-title">Suggested questions</div>
              <div
                v-for="(item, index) in presetQuestions"
                :key="index"
                class="assistant-dialog__preset-item"
                :class="{ 'is-active': selectedPresetIndex === index }"
                @click="selectPreset(index)"
              >
                <img
                  class="assistant-dialog__preset-icon"
                  src="./assets/icon-lightning.svg"
                  alt=""
                  draggable="false"
                />
                <p class="assistant-dialog__preset-text">{{ item }}</p>
                <img
                  class="assistant-dialog__preset-arrow"
                  :src="selectedPresetIndex === index
                    ? assetUrl('./assets/icon-arrow-right-active.svg')
                    : assetUrl('./assets/icon-arrow-right.svg')"
                  alt=""
                  draggable="false"
                />
              </div>
            </div>
          </div>

          <div v-else class="assistant-dialog__chat-body" ref="chatBody">
            <div v-if="presetQuestions.length" class="assistant-dialog__quick-row">
              <button
                v-for="(item, index) in presetQuestions"
                :key="'quick-' + index"
                type="button"
                class="assistant-dialog__quick-chip"
                :disabled="isStreaming"
                @click="selectQuickPrompt(item)"
              >
                <img
                  class="assistant-dialog__quick-chip-icon"
                  src="./assets/icon-lightning.svg"
                  alt=""
                  draggable="false"
                />
                <span>{{ item }}</span>
              </button>
            </div>

            <div class="assistant-dialog__messages">
              <template v-for="msg in messages">
                <article
                  v-if="msg.role === 'user'"
                  :key="msg.id"
                  class="chat-message chat-message--user"
                >
                  <div class="chat-message__header">
                    <span class="chat-message__label">You</span>
                    <span class="chat-message__meta">{{ formatMessageTime(msg.timestamp) }}</span>
                  </div>
                  <div class="chat-message__body">{{ msg.content }}</div>
                  <div v-if="msg.attachments && msg.attachments.length" class="chat-message__attachments">
                    <span v-for="attachment in msg.attachments" :key="attachment.name" :title="attachment.name">
                      {{ attachmentExtension(attachment.name) }} · {{ attachment.name }}
                    </span>
                  </div>
                </article>

                <article
                  v-else-if="msg.role === 'agent'"
                  :key="msg.id"
                  class="chat-message chat-message--agent"
                >
                  <div class="chat-message__header">
                    <span class="chat-message__label">Agent</span>
                    <span class="chat-message__meta">
                      <span v-if="msg.response">{{ msg.response.agent_mode || 'simple' }} · {{ msg.response.model || modelLabel }}</span>
                      <button
                        type="button"
                        class="chat-message__copy-btn"
                        title="Copy"
                        aria-label="Copy answer"
                        @click="copyMessageContent(msg)"
                      ><i class="el-icon-document-copy" aria-hidden="true" /></button>
                    </span>
                  </div>
                  <div
                    v-if="getAgentStatusText(msg)"
                    class="chat-message__status"
                    :class="getAgentStatusClass(msg)"
                  >
                    <span class="chat-message__status-icon">{{ getAgentStatusIcon(msg) }}</span>
                    <span>{{ getAgentStatusText(msg) }}</span>
                  </div>
                  <div
                    v-for="(warning, wIndex) in getMessageWarnings(msg)"
                    :key="'warn-' + msg.id + '-' + wIndex"
                    class="chat-message__warning"
                  >
                    <span class="chat-message__warning-icon">⚠</span>
                    <span>{{ warning }}</span>
                  </div>
                  <section
                    v-if="getRiskApprovalNotice(msg)"
                    class="chat-message__approval-card"
                    :class="getRiskApprovalNotice(msg).className"
                  >
                    <div class="chat-message__approval-card-title">
                      {{ getRiskApprovalNotice(msg).title }}
                    </div>
                    <p>{{ getRiskApprovalNotice(msg).detail }}</p>
                    <div
                      v-if="getRiskApprovalNotice(msg).meta.length"
                      class="chat-message__approval-card-meta"
                    >
                      <span
                        v-for="item in getRiskApprovalNotice(msg).meta"
                        :key="'approval-meta-' + msg.id + '-' + item.key"
                      >{{ item.label }}</span>
                    </div>
                  </section>
                  <div
                    v-if="!msg.isError || msg.response"
                    class="chat-message__body"
                    v-html="getMessageChatHtml(msg)"
                  />
                  <div
                    v-if="hasMessageReportCard(msg)"
                    class="report-tags"
                  >
                    <button
                      v-if="hasMessageReportPdfPreview(msg)"
                      type="button"
                      class="file-tag file-tag-pdf"
                      :title="'Preview PDF - ' + getMessageReportFilename(msg, 'pdf')"
                      @click="previewMessageReportPdf(msg)"
                    >
                      <span class="file-tag-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c5 0 8 5 8 7s-3 7-8 7-8-5-8-7 3-7 8-7zm0 2c-3.7 0-6 3.8-6 5s2.3 5 6 5 6-3.8 6-5-2.3-5-6-5zm0 2.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5z" fill="#ef4444"/></svg>
                      </span>
                      <span class="file-tag-name">{{ getMessageReportShortFilename(msg, 'pdf') }}</span>
                      <span class="file-tag-badge">Preview PDF</span>
                    </button>
                    <button
                      v-if="hasMessageReportPdfDownload(msg)"
                      type="button"
                      class="file-tag file-tag-pdf"
                      :title="'Download PDF - ' + getMessageReportFilename(msg, 'pdf')"
                      @click="downloadMessageReportPdf(msg)"
                    >
                      <span class="file-tag-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v9.2l3.6-3.6L17 10l-5 5-5-5 1.4-1.4 3.6 3.6V3h2zM5 19h14v2H5v-2z" fill="#ef4444"/></svg>
                      </span>
                      <span class="file-tag-name">{{ getMessageReportShortFilename(msg, 'pdf') }}</span>
                      <span class="file-tag-badge">Download PDF</span>
                    </button>
                    <button
                      v-if="hasMessageReportMarkdown(msg)"
                      type="button"
                      class="file-tag file-tag-md"
                      :title="'Download Markdown - ' + getMessageReportFilename(msg)"
                      @click="downloadMessageReportMarkdown(msg)"
                    >
                      <span class="file-tag-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z" fill="#52525b"/></svg>
                      </span>
                      <span class="file-tag-name">{{ getMessageReportShortFilename(msg, 'md') }}</span>
                      <span class="file-tag-badge">MD</span>
                    </button>
                    <button
                      v-if="hasMessageReportDocx(msg)"
                      type="button"
                      class="file-tag file-tag-docx"
                      :title="'Download Word - ' + getMessageReportFilename(msg, 'docx')"
                      @click="downloadMessageReportDocx(msg)"
                    >
                      <span class="file-tag-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6zm3-5h1.3l.6-3.3.7 3.3h1.2l1.2-5h-1.2l-.6 3.2-.7-3.2h-1.1l-.6 3.2-.6-3.2H8l1 5z" fill="#2563eb"/></svg>
                      </span>
                      <span class="file-tag-name">{{ getMessageReportShortFilename(msg, 'docx') }}</span>
                      <span class="file-tag-badge">Word</span>
                    </button>
                  </div>
                  <div
                    v-if="getMessageCharts(msg).length"
                    class="assistant-chart-list"
                  >
                    <div class="assistant-chart-list__toolbar">
                      <span class="assistant-chart-list__label">Trends ({{ getMessageCharts(msg).length }})</span>
                      <span class="assistant-chart-list__actions">
                        <button
                          type="button"
                          class="assistant-chart-list__action"
                          :disabled="!hasCollapsedCharts(msg.id, getMessageCharts(msg))"
                          @click="setAllChartsCollapsed(msg.id, getMessageCharts(msg), false)"
                        >
                          Expand all
                        </button>
                        <button
                          type="button"
                          class="assistant-chart-list__action"
                          :disabled="areAllChartsCollapsed(msg.id, getMessageCharts(msg))"
                          @click="setAllChartsCollapsed(msg.id, getMessageCharts(msg), true)"
                        >
                          Collapse all
                        </button>
                      </span>
                    </div>
                    <section
                      v-for="(chart, chartIndex) in getMessageCharts(msg)"
                      :key="chartDomKey(msg.id, chartIndex)"
                      class="assistant-chart"
                      :class="{
                        'is-collapsed': isChartCollapsed(msg.id, chartIndex),
                        'assistant-chart--market-window': isMarketWindowChart(chart),
                        'assistant-chart--soc-pcs': isSocPcsTrendChart(chart)
                      }"
                    >
                      <div class="assistant-chart__head">
                        <button
                          type="button"
                          class="assistant-chart__head-toggle"
                          :aria-expanded="isChartCollapsed(msg.id, chartIndex) ? 'false' : 'true'"
                          :title="isChartCollapsed(msg.id, chartIndex) ? 'Expand chart' : 'Collapse chart'"
                          @click="toggleChartCollapsed(msg.id, chartIndex)"
                        >
                          <span class="assistant-chart__head-copy">
                            <span class="assistant-chart__figure-number">Fig. {{ chartIndex + 1 }}.</span>
                            <span class="assistant-chart__title">{{ chart.title || 'Chart' }}</span>
                            <span v-if="chart.subtitle" class="assistant-chart__subtitle">{{ chart.subtitle }}</span>
                          </span>
                          <span class="assistant-chart__toggle" aria-hidden="true">
                            <span
                              class="assistant-chart__toggle-mark"
                              :class="{ 'is-collapsed': isChartCollapsed(msg.id, chartIndex) }"
                            />
                          </span>
                        </button>
                      </div>
                      <div
                        v-if="!isChartCollapsed(msg.id, chartIndex)"
                        class="assistant-chart__body"
                        :style="chartBodyStyle(chart)"
                        :data-chart-key="chartDomKey(msg.id, chartIndex)"
                        :data-chart-message-id="msg.id"
                        :data-chart-index="chartIndex"
                      />
                      <div
                        v-if="getChartSummaryItems(chart).length"
                        class="assistant-chart__summary"
                      >
                        <div
                          v-for="item in getChartSummaryItems(chart)"
                          :key="item.key"
                          class="assistant-chart__summary-item"
                          :class="item.className"
                        >
                          <span>{{ item.label }}</span>
                          <strong>{{ item.value }}</strong>
                        </div>
                      </div>
                    </section>
                  </div>
                  <div
                    v-if="getNextActions(msg).length"
                    class="chat-message__next-actions"
                  >
                    <div class="chat-message__section-label">Suggested actions</div>
                    <ul>
                      <li
                        v-for="(action, actionIndex) in getNextActions(msg)"
                        :key="'next-action-' + msg.id + '-' + actionIndex"
                      >{{ action }}</li>
                    </ul>
                  </div>
                  <button
                    v-if="msg.response && msg.response.display && msg.response.display.evidence && msg.response.display.evidence.length"
                    type="button"
                    class="chat-message__evidence-toggle"
                    @click="toggleEvidence(msg.id)"
                  >
                    <span class="chat-message__evidence-arrow" :class="{ 'is-open': isEvidenceExpanded(msg.id) }">›</span>
                    <span>Evidence ({{ msg.response.display.evidence.length }})</span>
                  </button>
                  <ul
                    v-if="isEvidenceExpanded(msg.id) && msg.response"
                    class="chat-message__evidence-list"
                  >
                    <li
                      v-for="(item, eIndex) in msg.response.display.evidence"
                      :key="'evidence-' + msg.id + '-' + eIndex"
                    >{{ item }}</li>
                  </ul>
                  <details
                    v-if="getToolCalls(msg).length"
                    class="chat-message__trace"
                  >
                    <summary>Tool calls ({{ getToolCalls(msg).length }})</summary>
                    <ul>
                      <li
                        v-for="(call, callIndex) in getToolCalls(msg)"
                        :key="'tool-call-' + msg.id + '-' + callIndex"
                      >
                        <span class="chat-message__trace-name">{{ call.name || call.tool || 'tool' }}</span>
                        <span v-if="call.status" class="chat-message__trace-status">{{ call.status }}</span>
                        <span v-if="call.summary" class="chat-message__trace-summary">{{ call.summary }}</span>
                      </li>
                    </ul>
                  </details>
                  <details
                    v-if="getAttachmentReferences(msg).length"
                    class="chat-message__trace"
                  >
                    <summary>Attachment references ({{ getAttachmentReferences(msg).length }})</summary>
                    <ul>
                      <li
                        v-for="(attachment, attachmentIndex) in getAttachmentReferences(msg)"
                        :key="'attachment-ref-' + msg.id + '-' + attachmentIndex"
                      >
                        <span class="chat-message__trace-name">{{ attachment.filename || attachment.name || attachment.attachment_id || 'attachment' }}</span>
                        <span v-if="attachment.summary" class="chat-message__trace-summary">{{ attachment.summary }}</span>
                      </li>
                    </ul>
                  </details>
                  <p v-if="msg.response && msg.response.requires_approval" class="chat-message__approval">
                    This action requires approval before execution.
                  </p>
                </article>
              </template>

              <article
                v-if="isStreaming"
                class="chat-message chat-message--agent chat-message--streaming"
                role="status"
                aria-live="polite"
                aria-busy="true"
              >
                <div class="chat-message__header">
                  <span class="chat-message__label">Agent</span>
                  <span class="chat-message__meta">{{ agentMode }} · {{ modelLabel }}</span>
                </div>
                <section
                  class="agent-progress"
                  :class="[
                    'is-' + streamPhase,
                    { 'is-thinking': agentMode === 'thinking', 'is-expanded': streamProgressExpanded }
                  ]"
                >
                  <div class="agent-progress__head">
                    <span class="agent-progress__indicator" :class="{ 'is-complete': streamPhase === 'completed' }" aria-hidden="true">
                      <i v-if="streamPhase === 'completed'" class="el-icon-check" />
                      <agent-loading-indicator v-else />
                    </span>
                    <div class="agent-progress__headline">
                      <strong>{{ streamProgressTitle() }}</strong>
                      <span v-if="streamActivityDetail && !streamingOutput">{{ streamActivityDetail }}</span>
                      <span v-else-if="streamActivities.length">
                        {{ streamCompletedCount() }} of {{ streamActivities.length }} steps completed
                      </span>
                    </div>
                    <time class="agent-progress__elapsed">{{ streamElapsedLabel() }}</time>
                    <button
                      v-if="streamActivities.length"
                      type="button"
                      class="agent-progress__toggle"
                      :aria-expanded="streamProgressExpanded ? 'true' : 'false'"
                      :title="streamProgressExpanded ? 'Hide progress details' : 'Show progress details'"
                      @click="toggleStreamProgress"
                    >
                      <i class="el-icon-arrow-down" :class="{ 'is-open': streamProgressExpanded }" aria-hidden="true" />
                    </button>
                  </div>

                  <transition name="agent-progress-list">
                    <ol v-if="streamProgressExpanded && streamActivities.length" class="agent-progress__list">
                      <li
                        v-for="activity in streamActivities"
                        :key="activity.key"
                        class="agent-progress__item"
                        :class="'is-' + activity.status"
                      >
                        <span class="agent-progress__marker" aria-hidden="true">
                          <i v-if="activity.status === 'completed'" class="el-icon-check" />
                          <i v-else-if="activity.status === 'warning'" class="el-icon-warning-outline" />
                          <i v-else-if="activity.status === 'failed'" class="el-icon-close" />
                          <span v-else-if="activity.status === 'running'" class="agent-progress__running-dot" />
                          <span v-else class="agent-progress__waiting-dot" />
                        </span>
                        <span class="agent-progress__item-copy">
                          <strong :class="{ 'is-tool': activity.kind === 'tool' }">{{ activity.label }}</strong>
                          <small v-if="activity.detail">{{ activity.detail }}</small>
                        </span>
                        <span class="agent-progress__state">{{ streamActivityStateLabel(activity) }}</span>
                      </li>
                    </ol>
                  </transition>

                  <p v-if="streamLongWaitText()" class="agent-progress__long-wait">
                    <i class="el-icon-time" aria-hidden="true" />
                    {{ streamLongWaitText() }}
                  </p>
                </section>
                <div
                  v-if="false"
                  class="chat-message__status"
                  :class="streamingOutput ? 'chat-message__status--ok' : 'chat-message__status--pending'"
                >
                  <span
                    class="chat-message__status-icon"
                    :class="{ 'chat-message__status-icon--spin': !streamingOutput }"
                  >{{ streamingOutput ? '✓' : '◌' }}</span>
                  <span>{{ streamingOutput ? 'Answer generated' : streamActivityTitle }}</span>
                </div>
                <p v-if="false" class="chat-message__stream-detail">{{ streamActivityDetail }}</p>
                <ul v-if="false" class="chat-message__stream-steps">
                  <li v-for="(step, index) in streamActivitySteps" :key="'stream-step-' + index">{{ step }}</li>
                </ul>
                <div
                  v-if="streamingOutput"
                  class="chat-message__body chat-message__body--preview"
                  v-html="formatAnswer(getReportChatContent(streamingOutput))"
                />
                <div
                  v-if="streamingCharts.length"
                  class="assistant-chart-list"
                >
                  <div class="assistant-chart-list__toolbar">
                    <span class="assistant-chart-list__label">Trends ({{ streamingCharts.length }})</span>
                    <span class="assistant-chart-list__actions">
                      <button
                        type="button"
                        class="assistant-chart-list__action"
                        :disabled="!hasCollapsedCharts('streaming', streamingCharts)"
                        @click="setAllChartsCollapsed('streaming', streamingCharts, false)"
                      >
                        Expand all
                      </button>
                      <button
                        type="button"
                        class="assistant-chart-list__action"
                        :disabled="areAllChartsCollapsed('streaming', streamingCharts)"
                        @click="setAllChartsCollapsed('streaming', streamingCharts, true)"
                      >
                        Collapse all
                      </button>
                    </span>
                  </div>
                  <section
                    v-for="(chart, chartIndex) in streamingCharts"
                    :key="chartDomKey('streaming', chartIndex)"
                    class="assistant-chart"
                    :class="{
                      'is-collapsed': isChartCollapsed('streaming', chartIndex),
                      'assistant-chart--market-window': isMarketWindowChart(chart),
                      'assistant-chart--soc-pcs': isSocPcsTrendChart(chart)
                    }"
                  >
                    <div class="assistant-chart__head">
                      <button
                        type="button"
                        class="assistant-chart__head-toggle"
                        :aria-expanded="isChartCollapsed('streaming', chartIndex) ? 'false' : 'true'"
                        :title="isChartCollapsed('streaming', chartIndex) ? 'Expand chart' : 'Collapse chart'"
                        @click="toggleChartCollapsed('streaming', chartIndex)"
                      >
                        <span class="assistant-chart__head-copy">
                          <span class="assistant-chart__figure-number">Fig. {{ chartIndex + 1 }}.</span>
                          <span class="assistant-chart__title">{{ chart.title || 'Chart' }}</span>
                          <span v-if="chart.subtitle" class="assistant-chart__subtitle">{{ chart.subtitle }}</span>
                        </span>
                        <span class="assistant-chart__toggle" aria-hidden="true">
                          <span
                            class="assistant-chart__toggle-mark"
                            :class="{ 'is-collapsed': isChartCollapsed('streaming', chartIndex) }"
                          />
                        </span>
                      </button>
                    </div>
                    <div
                      v-if="!isChartCollapsed('streaming', chartIndex)"
                      class="assistant-chart__body"
                      :style="chartBodyStyle(chart)"
                      :data-chart-key="chartDomKey('streaming', chartIndex)"
                      data-chart-message-id="streaming"
                      :data-chart-index="chartIndex"
                    />
                    <div
                      v-if="getChartSummaryItems(chart).length"
                      class="assistant-chart__summary"
                    >
                      <div
                        v-for="item in getChartSummaryItems(chart)"
                        :key="item.key"
                        class="assistant-chart__summary-item"
                        :class="item.className"
                      >
                        <span>{{ item.label }}</span>
                        <strong>{{ item.value }}</strong>
                      </div>
                    </div>
                  </section>
                </div>
              </article>
            </div>
          </div>

          <div v-if="!historyPanelOpen || isFullscreen" class="assistant-dialog__footer">
          <div
            v-if="agentMode === 'thinking' || hasAttachment || attachmentStatus === 'error'"
            class="assistant-dialog__composer-toolbar"
          >
            <div
              class="assistant-dialog__attachment-status"
              :class="attachmentStatusClass"
            >
              <span class="assistant-dialog__attachment-status-dot" />
              <span class="assistant-dialog__attachment-status-text">{{ attachmentStatusText }}</span>
              <span v-if="attachmentStatus === 'error' && attachmentDetailText" class="assistant-dialog__attachment-status-detail">{{ attachmentDetailText }}</span>
            </div>
          </div>
          <div
            class="assistant-dialog__input-box"
            :class="{
              'assistant-dialog__input-box--default': !hasAttachment,
              'assistant-dialog__input-box--expanded': hasAttachment
            }"
            data-node-id="3369:7995"
          >
            <div v-if="hasAttachment" class="assistant-dialog__attachment-list" data-node-id="3023:9488">
              <div
                v-for="attachment in attachments"
                :key="attachment.localId"
                class="assistant-dialog__attachment-chip"
                :class="'is-' + attachment.status"
                :title="attachment.error || attachment.name"
              >
                <img
                  v-if="attachment.previewUrl"
                  :src="attachment.previewUrl"
                  :alt="attachment.name"
                  class="assistant-dialog__attachment-thumb"
                  draggable="false"
                />
                <span v-else class="assistant-dialog__attachment-file-icon">{{ attachmentExtension(attachment.name) }}</span>
                <span class="assistant-dialog__attachment-name">{{ attachment.name }}</span>
                <span class="assistant-dialog__attachment-state">{{ attachmentStateLabel(attachment) }}</span>
                <button
                  type="button"
                  class="assistant-dialog__attachment-remove"
                  :aria-label="'Remove ' + attachment.name"
                  :disabled="isStreaming"
                  @click.stop="removeAttachment(attachment.localId)"
                >
                  <img src="./assets/icon-close.svg" alt="" draggable="false" />
                </button>
              </div>
            </div>
            <button
              type="button"
              class="assistant-dialog__input-btn assistant-dialog__input-btn--attach"
              :class="{
                'is-expanded': hasAttachment,
                'is-disabled': !canUseAttachments
              }"
              :disabled="!canUseAttachments || isStreaming"
              :title="canUseAttachments ? 'Upload attachment' : 'Switch to Thinking to upload attachments'"
              :aria-label="canUseAttachments ? 'Upload attachment' : 'Attachment upload disabled in Simple mode'"
              data-node-id="3369:8022"
              @click="triggerAttach"
            >
              <img src="./assets/icon-attach.svg" alt="" draggable="false" />
            </button>
            <textarea
              ref="questionInput"
              v-model="questionText"
              rows="1"
              class="assistant-dialog__input-field"
              :class="{ 'is-expanded': hasAttachment }"
              :placeholder="inputPlaceholder"
              :readonly="isStreaming"
              data-node-id="3369:8025"
              @input="onQuestionInput"
              @keydown.enter.exact.prevent="handleSend"
            />
            <div
              class="assistant-dialog__model-menu"
              :class="{ 'is-open': agentModeMenuOpen }"
              data-node-id="3369:8030"
            >
              <button
                ref="agentModeSelect"
                type="button"
                class="assistant-dialog__model-select"
                :class="{
                  'is-open': agentModeMenuOpen,
                  'is-simple': agentMode === 'simple',
                  'is-thinking': agentMode === 'thinking'
                }"
                :disabled="isStreaming"
                aria-haspopup="listbox"
                :aria-expanded="agentModeMenuOpen ? 'true' : 'false'"
                @click="toggleAgentModeMenu"
              >
                <div class="assistant-dialog__model-select-inner" data-node-id="3369:8031">
                  <div class="assistant-dialog__model-label" data-node-id="3369:8032">
                    <span class="assistant-dialog__model-icon" data-node-id="3369:8033">
                      <i
                        :class="agentMode === 'thinking' ? 'el-icon-data-analysis' : 'el-icon-lightning'"
                        aria-hidden="true"
                      />
                    </span>
                    <p data-node-id="3369:8034">{{ agentModeLabel }}</p>
                  </div>
                </div>
                <i
                  class="el-icon-arrow-down assistant-dialog__model-chevron"
                  aria-hidden="true"
                  data-node-id="3369:8035"
                />
              </button>
              <transition name="assistant-model-menu">
                <div
                  v-if="agentModeMenuOpen"
                  ref="agentModeMenuOptions"
                  class="assistant-dialog__model-options"
                  :style="agentModeMenuStyle"
                  role="listbox"
                  aria-label="Agent mode"
                >
                  <button
                    v-for="option in agentModeOptions"
                    :key="option.value"
                    type="button"
                    class="assistant-dialog__model-option"
                    :class="{ 'is-selected': agentMode === option.value }"
                    role="option"
                    :aria-selected="agentMode === option.value ? 'true' : 'false'"
                    @click="selectAgentMode(option.value)"
                  >
                    <span class="assistant-dialog__model-option-title">{{ option.label }}</span>
                    <span class="assistant-dialog__model-option-desc">{{ option.description }}</span>
                    <i
                      v-if="agentMode === option.value"
                      class="el-icon-check assistant-dialog__model-option-check"
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </transition>
            </div>
            <button
              type="button"
              class="assistant-dialog__input-btn assistant-dialog__input-btn--send"
              :class="{
                'is-expanded': hasAttachment,
                'is-stop': isStreaming,
                'is-active': showSendActive
              }"
              data-node-id="3369:8027"
              :disabled="!isStreaming && !canSend"
              :title="isStreaming ? 'Stop generation' : 'Send'"
              :aria-label="isStreaming ? 'Stop generation' : 'Send message'"
              @click="isStreaming ? stopGeneration() : handleSend()"
            >
              <span v-if="isStreaming" class="assistant-dialog__stop-icon" />
              <img v-else
                :src="showSendActive
                  ? assetUrl('./assets/icon-send-active.svg')
                  : assetUrl('./assets/icon-send.svg')"
                alt=""
                draggable="false"
              />
            </button>
          </div>

          <input
            ref="fileInput"
            type="file"
            multiple
            :accept="attachmentAccept"
            class="assistant-dialog__file-input"
            @change="handleFileChange"
          />

          <div v-if="phase === 'chat'" class="assistant-dialog__footer-meta">
            <button
              type="button"
              class="assistant-dialog__new-chat-btn"
              :disabled="isStreaming"
              @click="startNewChat"
            >
              <i class="el-icon-plus" aria-hidden="true" />
              <span>New chat</span>
            </button>

            <div class="assistant-dialog__disclaimer" data-node-id="3369:8037">
              <p data-node-id="3369:8038">AI-generated · Verify critical actions</p>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script>
import { getPageZoom, context, sendHost, storageIdentity, getContextVersion } from './context.js'
import * as echarts from 'echarts'
import {wallClock,wallClockToIso,presetTimeRange,formatAgentDate} from './time.js'
import {
  getHealth,
  getTools,
  getRagHealth,
  getSites,
  streamChatMessage,
  uploadAttachment,
  deleteAttachment,
  resolveSiteId,
  resolveSiteLabel,
  isSiteDirectoryStale,
  loadSelectedSiteIds,
  saveSelectedSiteIds,
  loadConversationId,
  saveConversationId,
  loadAgentMode,
  saveAgentMode,
  loadTimeRange,
  saveTimeRange,
  AgentApiError
} from './api.js'
import {
  mapDisplayQuestionToInternal,
  mapInternalTextToDisplay,
  mapAgentResponseToDisplay,
  resolveMappedSiteIdsFromQuestion,
  mergeSiteScopes,
  isGlobalSiteQuestion
} from './siteAliasMap'
import {
  collectAgentPageContext,
  executeAgentFrontendActions
} from './context.js'
import AgentLoadingIndicator from './AgentLoadingIndicator.vue'

const assets = import.meta.glob('./assets/*', {eager:true,query:'?url',import:'default'})
const assetUrl = value => assets[value]
const DIALOG_WIDTH = 480
const DIALOG_MIN_WIDTH = 400
const DIALOG_MAX_WIDTH = 620
const DIALOG_HEIGHT = 860
const BUBBLE_SIZE = 154
const DRAWER_WIDTH_STORAGE_KEY = 'energy_agent_drawer_width'
const DIALOG_BUBBLE_GAP = 0

const DEFAULT_PRESETS = [
  'What is the current status?',
  "Show today's revenue summary",
  'Analyze recent performance'
]

const AGENT_MODE_LABELS = {
  simple: 'Simple',
  thinking: 'Thinking'
}
const TIME_RANGE_PRESETS = [
  { value: 'today', label: 'Today', title: 'Set range from today 00:00 to now' },
  { value: 'last7', label: '7 days', title: 'Set range to the last 7 days' },
  { value: 'last30', label: '30 days', title: 'Set range to the last 30 days' },
  { value: 'clear', label: 'Clear', title: 'Clear custom time range' }
]
const ATTACHMENT_MAX_SIZE = 20 * 1024 * 1024
const ATTACHMENT_ACCEPT = '.txt,.md,.csv,.pdf,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp'
const ATTACHMENT_EXTENSIONS = new Set([
  '.txt', '.md', '.csv', '.pdf', '.docx', '.xls', '.xlsx',
  '.jpg', '.jpeg', '.png', '.webp'
])
const HISTORY_STORAGE_KEY = 'energy_agent_conversation_history_v2'
const HISTORY_MAX_ITEMS = 30
const HISTORY_MAX_MESSAGES = 80
const HISTORY_TITLE_LENGTH = 72
const HISTORY_PREVIEW_LENGTH = 120
const MESSAGE_PRESENTATION_CACHE = new WeakMap()
const SITE_SCOPE_SOURCES = {
  NONE: 'none',
  USER: 'user',
  HISTORY: 'history',
  ROUTE: 'route',
  AGENT: 'agent'
}

function getAttachmentExtension(filename) {
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot).toLowerCase() : ''
}

function isAllowedAttachment(file) {
  const ext = getAttachmentExtension(file.name)
  if (ATTACHMENT_EXTENSIONS.has(ext)) return true
  return !!(file.type && file.type.startsWith('image/'))
}

function isImageAttachmentFile(file) {
  if (!file) return false
  const ext = getAttachmentExtension(file.name)
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return true
  return !!(file.type && file.type.startsWith('image/'))
}

function loadDrawerWidth() {
  const value = Number(localStorage.getItem(DRAWER_WIDTH_STORAGE_KEY))
  return Number.isFinite(value) && value > 0 ? value : DIALOG_WIDTH
}

function saveDrawerWidth(width) {
  localStorage.setItem(DRAWER_WIDTH_STORAGE_KEY, String(Math.round(width)))
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttribute(text) {
  return escapeHtml(text).replace(/'/g, '&#39;')
}

function formatAnswerHtml(text) {
  const executionPlan = extractExecutionPlanSection(text)
  if (executionPlan) {
    const before = executionPlan.before ? formatAnswerHtml(executionPlan.before) : ''
    const plan = renderExecutionPlanDetails(executionPlan)
    const after = executionPlan.after ? formatAnswerHtml(executionPlan.after) : ''
    return `${before}${plan}${after}`
  }

  const sentinel = '\uE000'
  const codeBlocks = []
  const tables = []
  let result = String(text ?? '').replace(/\r\n/g, '\n')

  result = result.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, _lang, code) => {
    const index = codeBlocks.length
    codeBlocks.push(`<pre><code>${escapeHtml(String(code).trim())}</code></pre>`)
    return `${sentinel}CODE${index}${sentinel}`
  })

  result = escapeHtml(result)
  result = result.replace(
    /(^|\n)(\|[^\n]+\|\n\|[-: |]+\|\n(?:\|[^\n]+\|\n?)*)/g,
    (_match, prefix, tableBlock) => {
      const index = tables.length
      tables.push(markdownTableToHtml(tableBlock))
      return `${prefix}${sentinel}TABLE${index}${sentinel}`
    }
  )

  const lines = result.split('\n')
  const out = []
  let listType = null
  const sentinelRe = new RegExp(`^${sentinel}(CODE|TABLE)(\\d+)${sentinel}$`)

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`)
      listType = null
    }
  }

  for (const rawLine of lines) {
    const raw = rawLine.trim()
    const sentinelMatch = sentinelRe.exec(raw)
    if (sentinelMatch) {
      closeList()
      const index = Number(sentinelMatch[2])
      out.push(sentinelMatch[1] === 'CODE' ? codeBlocks[index] : tables[index])
      continue
    }

    if (!raw) {
      closeList()
      continue
    }

    let match
    if ((match = /^####\s+(.+)$/.exec(raw))) {
      closeList()
      out.push(`<h4>${formatInlineHtml(match[1], sentinel)}</h4>`)
      continue
    }
    if ((match = /^###\s+(.+)$/.exec(raw))) {
      closeList()
      out.push(`<h3>${formatInlineHtml(match[1], sentinel)}</h3>`)
      continue
    }
    if ((match = /^##\s+(.+)$/.exec(raw))) {
      closeList()
      out.push(`<h3>${formatInlineHtml(match[1], sentinel)}</h3>`)
      continue
    }
    if ((match = /^#\s+(.+)$/.exec(raw))) {
      closeList()
      out.push(`<h2>${formatInlineHtml(match[1], sentinel)}</h2>`)
      continue
    }
    if (/^-{3,}$/.test(raw)) {
      closeList()
      out.push('<hr>')
      continue
    }
    if ((match = /^&gt;\s+(.+)$/.exec(raw))) {
      closeList()
      out.push(`<blockquote>${formatInlineHtml(match[1], sentinel)}</blockquote>`)
      continue
    }
    if ((match = /^[-*•]\s+(.+)$/.exec(raw))) {
      if (listType !== 'ul') {
        closeList()
        out.push('<ul>')
        listType = 'ul'
      }
      out.push(`<li>${formatInlineHtml(match[1], sentinel)}</li>`)
      continue
    }
    if ((match = /^\d+\.\s+(.+)$/.exec(raw))) {
      if (listType !== 'ol') {
        closeList()
        out.push('<ol>')
        listType = 'ol'
      }
      out.push(`<li>${formatInlineHtml(match[1], sentinel)}</li>`)
      continue
    }

    closeList()
    out.push(`<p>${formatInlineHtml(raw, sentinel)}</p>`)
  }

  closeList()
  return out.join('')
}

function extractExecutionPlanSection(text) {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n')
  const headingIndex = lines.findIndex(line => isExecutionPlanHeading(line))
  if (headingIndex < 0) return null

  let bodyStart = headingIndex + 1
  while (bodyStart < lines.length && !lines[bodyStart].trim()) bodyStart++

  let countLabel = ''
  if (bodyStart < lines.length && isExecutionPlanCountLine(lines[bodyStart])) {
    countLabel = lines[bodyStart].trim()
    bodyStart++
    while (bodyStart < lines.length && !lines[bodyStart].trim()) bodyStart++
  }

  let end = lines.length
  for (let index = bodyStart; index < lines.length; index++) {
    const raw = lines[index].trim()
    if (!raw) continue
    if (isSectionHeading(raw) && index > bodyStart) {
      end = index
      break
    }
  }

  const before = lines.slice(0, headingIndex).join('\n').trim()
  const body = lines.slice(bodyStart, end).join('\n').trim()
  const after = lines.slice(end).join('\n').trim()
  if (!body) return null

  return {
    before,
    body,
    after,
    title: getExecutionPlanTitle(lines[headingIndex]),
    countLabel,
    stepCount: countExecutionPlanSteps(body),
  }
}

function renderExecutionPlanDetails({ title, body, countLabel, stepCount }) {
  const meta = countLabel || (stepCount > 0 ? `${stepCount} steps` : '')
  return `
<details class="chat-message__execution-plan" open>
  <summary>
    <span class="chat-message__execution-plan-title">${escapeHtml(title || 'Execution plan')}</span>
    ${meta ? `<span class="chat-message__execution-plan-meta">${escapeHtml(meta)}</span>` : ''}
  </summary>
  <div class="chat-message__execution-plan-body">${body}</div>
</details>`
}

function getExecutionPlanTitle(line) {
  const title = stripMarkdownInline(String(line ?? '')).replace(/^#{1,6}\s*/, '').trim()
  return title || 'Execution plan'
}

function isExecutionPlanHeading(line) {
  return normalizeSectionHeading(line) === 'execution plan'
}

function isSectionHeading(line) {
  return /^#{1,6}\s+\S/.test(String(line ?? '').trim())
}

function isExecutionPlanCountLine(line) {
  return /^\d+\s*(?:steps?|items?|actions?)$/i.test(normalizePlainText(line))
}

function countExecutionPlanSteps(text) {
  return String(text ?? '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(isExecutionPlanStepLine)
    .length
}

function isExecutionPlanStepLine(line) {
  const text = String(line ?? '').trim()
  return (
    /^([✓✔✅\-*•]|\d+[.)])\s+\S/.test(text) ||
    /^[^:\s]{2,80}:\s+\S/.test(text)
  )
}

function stripMarkdownInline(text) {
  return String(text ?? '')
    .replace(/^\s*>\s*/, '')
    .replace(/^\s*#{1,6}\s*/, '')
    .replace(/^\*\*(.+)\*\*$/, '$1')
    .replace(/^__(.+)__$/, '$1')
    .replace(/\s*[:：]\s*$/, '')
    .trim()
}

function normalizeSectionHeading(text) {
  return stripMarkdownInline(text).toLowerCase()
}

function normalizePlainText(text) {
  return stripMarkdownInline(String(text ?? '')).toLowerCase()
}

function formatInlineHtml(line, sentinel) {
  const inlineCode = []
  let result = String(line).replace(/`([^`\n]+?)`/g, (_match, code) => {
    const index = inlineCode.length
    inlineCode.push(`<code class="inline-code">${code}</code>`)
    return `${sentinel}INLINE${index}${sentinel}`
  })

  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  result = result.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>')
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
    return `<a href="${escapeAttribute(sanitizeMarkdownHref(href))}" target="_blank" rel="noopener noreferrer">${label}</a>`
  })
  result = result.replace(new RegExp(`${sentinel}INLINE(\\d+)${sentinel}`, 'g'), (_match, index) => {
    return inlineCode[Number(index)] || ''
  })

  return result
}

function sanitizeMarkdownHref(href) {
  const value = String(href || '').trim()
  if (/^(https?:|mailto:|\/|#)/i.test(value)) {
    return value
  }
  return '#'
}

function markdownTableToHtml(markdown) {
  const rows = String(markdown || '')
    .trim()
    .split('\n')
    .filter(row => row.includes('|'))

  if (rows.length < 2 || !/^\|?[-: |]+\|?$/.test(rows[1].trim())) {
    return `<p>${escapeHtml(markdown)}</p>`
  }

  const readCells = (row) => row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim())

  const headers = readCells(rows[0])
  const bodyRows = rows.slice(2).map(readCells)
  const columnCount = headers.length
  const maxCellLength = Math.max(
    0,
    ...headers.map(cell => String(cell || '').length),
    ...bodyRows.flat().map(cell => String(cell || '').length)
  )
  const tableClasses = []
  if (columnCount >= 6 || maxCellLength > 28) tableClasses.push('wide')
  if (columnCount >= 8 || maxCellLength > 42) tableClasses.push('dense')
  tableClasses.push(bodyRows.length > 12 ? 'is-long-table' : 'is-short-table')
  const classAttribute = tableClasses.length ? ` class="${tableClasses.join(' ')}"` : ''

  const wrapperClass = bodyRows.length > 12 ? 'table-wrapper table-wrapper--long' : 'table-wrapper table-wrapper--short'
  let html = `<div class="${wrapperClass}"><table${classAttribute}><thead><tr>`
  headers.forEach(header => {
    html += `<th>${header}</th>`
  })
  html += '</tr></thead><tbody>'
  bodyRows.forEach(row => {
    html += '<tr>'
    row.forEach(cell => {
      html += `<td>${cell}</td>`
    })
    html += '</tr>'
  })
  html += '</tbody></table></div>'
  return html
}

function parseReportFence(content) {
  const text = String(content ?? '')
  const opening = /(^|\n)[ \t]*(`{3,}|~{3,})report[^\n]*(?:\n|$)/i.exec(text)
  if (!opening) return null

  const start = opening.index + (opening[1] ? 1 : 0)
  const bodyStart = opening.index + opening[0].length
  const bodyAndRest = text.slice(bodyStart)
  const fenceChar = escapeRegExp(opening[2][0])
  const minLength = opening[2].length
  const closingRe = new RegExp(`(^|\\n)[ \\t]*${fenceChar}{${minLength},}[ \\t]*(?=\\n|$)`, 'g')
  let closing = null
  for (const match of bodyAndRest.matchAll(closingRe)) {
    closing = {
      start: match.index + (match[1] ? 1 : 0),
      end: match.index + match[0].length
    }
  }

  const markdown = (closing ? bodyAndRest.slice(0, closing.start) : bodyAndRest).trim()
  return markdown ? { start, markdown } : null
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractReportBlock(content) {
  const text = String(content ?? '')
  const reportFence = parseReportFence(text)
  if (!reportFence) {
    return {
      chatContent: text,
      reportContent: ''
    }
  }

  const summaryText = text.slice(0, reportFence.start).trim()
  const chatContent = [summaryText, reportFence.markdown].filter(Boolean).join('\n\n') || reportFence.markdown || 'Report generated.'

  return {
    chatContent,
    reportContent: reportFence.markdown
  }
}

function getStructuredReport(response) {
  const report = response?.ops_report
  return report && typeof report === 'object' && !Array.isArray(report) ? report : null
}

function structuredReportMarkdown(response) {
  const report = getStructuredReport(response)
  return report ? String(report.markdown ?? report.content ?? '') : ''
}

function structuredReportSummary(response, fallback = '') {
  const report = getStructuredReport(response)
  if (!report) return fallback
  const summary = String(report.summary ?? '').trim()
  if (summary) return summary
  return String(fallback || 'Report generated. Use the card below to download or export it.')
}

function structuredReportDisplayContent(response, fallback = '') {
  const markdown = structuredReportMarkdown(response).trim()
  if (markdown) return markdown
  return structuredReportSummary(response, fallback)
}

function buildMessageCharts(response) {
  const charts = []
  const seen = new Set()
  const structuredReport = getStructuredReport(response)
  for (const chart of [
    ...(Array.isArray(response?.charts) ? response.charts : []),
    ...(Array.isArray(structuredReport?.charts) ? structuredReport.charts : [])
  ]) {
    if (!hasRenderableChart(chart)) continue
    const key = chart.id || `${chart.title || ''}:${chart.metric || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    charts.push(chart)
  }
  return charts
}

function getMessagePresentation(msg) {
  if (!msg || typeof msg !== 'object') {
    return {
      chatContent: '',
      chatHtml: '',
      charts: []
    }
  }

  const cached = MESSAGE_PRESENTATION_CACHE.get(msg)
  if (
    cached &&
    cached.content === msg.content &&
    cached.response === msg.response
  ) {
    return cached
  }

  const chatContent = getStructuredReport(msg?.response)
    ? structuredReportDisplayContent(msg.response, msg?.content)
    : extractReportBlock(msg?.content).chatContent
  const presentation = {
    content: msg.content,
    response: msg.response,
    chatContent,
    chatHtml: formatAnswerHtml(chatContent),
    charts: buildMessageCharts(msg.response)
  }
  MESSAGE_PRESENTATION_CACHE.set(msg, presentation)
  return presentation
}

function structuredReportFiles(response) {
  const files = getStructuredReport(response)?.files
  return Array.isArray(files) ? files : []
}

function reportFileByFormat(files, format) {
  const wanted = String(format ?? '').toLowerCase()
  return (files ?? []).find(file => {
    const actual = String(file?.format ?? '').toLowerCase()
    return actual === wanted || (wanted === 'md' && actual === 'markdown') || (wanted === 'markdown' && actual === 'md')
  }) || null
}

function defaultReportDownloadFilename(file) {
  const format = String(file?.format ?? 'txt').toLowerCase()
  const extension = format === 'markdown' ? 'md' : format
  return `report.${extension || 'txt'}`
}

function downloadTextFile(content, filename, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([String(content ?? '')], { type: mimeType })
  downloadBlob(blob, filename)
}

function downloadBase64File(base64, filename, mimeType = 'application/octet-stream') {
  downloadBlob(base64ToBlob(base64, mimeType), filename)
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function openBase64File(base64, mimeType = 'application/octet-stream') {
  const blob = base64ToBlob(base64, mimeType)
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank', 'noopener')
  if (!win) {
    downloadBlob(blob, 'report.pdf')
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

function base64ToBlob(base64, mimeType = 'application/octet-stream') {
  const clean = String(base64 ?? '').replace(/\s+/g, '')
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

function downloadReportFile(file) {
  if (!file) return false
  if (file.content_base64) {
    downloadBase64File(file.content_base64, file.filename || defaultReportDownloadFilename(file), file.mime_type)
    return true
  }
  if (file.content !== undefined && file.content !== null) {
    downloadTextFile(file.content, file.filename || defaultReportDownloadFilename(file), file.mime_type || 'text/plain;charset=utf-8')
    return true
  }
  return false
}

const REPORT_CHART_STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'data',
  'chart',
  'trend',
  'report',
  'analysis',
  'value',
  'current',
  'daily',
  'today',
  'status',
  'output',
  'input',
  'selected'
])

const REPORT_CHART_ALIASES = [
  { key: 'pcs', terms: ['pcs', 'converter', 'inverter', 'power conversion system', '\u53d8\u6d41\u5668', '\u9006\u53d8\u5668'] },
  { key: 'pv', terms: ['pv', 'photovoltaic', 'solar', '\u5149\u4f0f', '\u592a\u9633\u80fd'] },
  { key: 'soc', terms: ['soc', 'state of charge', 'battery', '\u7535\u6c60', '\u8377\u7535\u72b6\u6001'] },
  { key: 'soh', terms: ['soh', 'state of health', 'battery', '\u7535\u6c60', '\u5065\u5eb7\u72b6\u6001'] },
  { key: 'bms', terms: ['bms', 'battery', '\u7535\u6c60'] },
  { key: 'battery', terms: ['battery', 'bess', 'energy storage', 'soc', 'soh', '\u7535\u6c60', '\u50a8\u80fd'] },
  { key: 'temperature', terms: ['temperature', 'temp', 'thermal', '\u6e29\u5ea6'] },
  { key: 'revenue', terms: ['revenue', 'income', 'profit', 'earnings', '\u6536\u76ca', '\u8425\u6536', '\u6536\u5165'] },
  { key: 'price', terms: ['price', 'tariff', 'electricity price', '\u7535\u4ef7', '\u7535\u8d39'] },
  { key: 'energy', terms: ['energy', 'charge', 'discharge', '\u7535\u91cf', '\u5145\u7535', '\u653e\u7535'] },
  { key: 'grid', terms: ['grid', 'grid-side', 'on-grid', 'off-grid', '\u7535\u7f51', '\u5e76\u7f51', '\u79bb\u7f51'] }
]

function normalizeReportText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[_/\\()[\]{}:;,.!?|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripMarkdownSyntax(value) {
  return String(value ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[#>*_`~|-]/g, ' ')
}

function addReportKeyword(map, term, weight = 1) {
  const value = normalizeReportText(term)
  if (!value || value.length < 2 || REPORT_CHART_STOPWORDS.has(value)) return
  if (/^[a-z0-9-]+$/.test(value) && value.length < 3 && !['pv'].includes(value)) return
  map.set(value, Math.max(map.get(value) || 0, weight))
}

function collectReportKeywordsFromText(map, value, weight = 1) {
  const text = normalizeReportText(stripMarkdownSyntax(value))
  if (!text) return
  addReportKeyword(map, text, weight)
  text.split(/\s+/).forEach(token => addReportKeyword(map, token, weight))
}

function buildChartImageKeywords(image) {
  const map = new Map()
  collectReportKeywordsFromText(map, image?.id, 4)
  collectReportKeywordsFromText(map, image?.title, 4)
  collectReportKeywordsFromText(map, image?.metric, 4)
  collectReportKeywordsFromText(map, image?.subtitle, 2)
  collectReportKeywordsFromText(map, image?.explanation, 2)
  ;(image?.seriesNames || []).forEach(name => collectReportKeywordsFromText(map, name, 3))

  const seed = Array.from(map.keys()).join(' ')
  REPORT_CHART_ALIASES.forEach(alias => {
    if (alias.terms.some(term => seed.includes(term))) {
      alias.terms.forEach(term => addReportKeyword(map, term, alias.key === 'pcs' || alias.key === 'pv' ? 4 : 2))
    }
  })
  return Array.from(map, ([term, weight]) => ({ term, weight }))
}

function reportTextContainsTerm(text, term) {
  const value = normalizeReportText(stripMarkdownSyntax(text))
  const keyword = normalizeReportText(term)
  if (!value || !keyword) return false
  if (/^[a-z0-9 -]+$/.test(keyword)) {
    const escaped = escapeRegExp(keyword).replace(/\\ /g, '\\s+')
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(value)
  }
  return value.includes(keyword)
}

function scoreReportText(text, keywords) {
  return keywords.reduce((score, keyword) => (
    reportTextContainsTerm(text, keyword.term) ? score + keyword.weight : score
  ), 0)
}

function splitReportSections(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n/g, '\n').split('\n')
  const sections = []
  let current = {
    start: 0,
    heading: '',
    level: 0
  }

  lines.forEach((line, index) => {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line.trim())
    if (!heading) return
    sections.push({ ...current, end: index, text: lines.slice(current.start, index).join('\n') })
    current = {
      start: index,
      heading: heading[2],
      level: heading[1].length
    }
  })
  sections.push({ ...current, end: lines.length, text: lines.slice(current.start).join('\n') })

  return {
    lines,
    sections: sections.filter(section => section.text.trim())
  }
}

function splitSectionBlocks(lines, section) {
  const blocks = []
  let start = section.heading ? section.start + 1 : section.start
  let index = start

  const pushBlock = (blockStart, blockEnd) => {
    if (blockEnd <= blockStart) return
    const text = lines.slice(blockStart, blockEnd).join('\n')
    if (text.trim()) {
      blocks.push({ start: blockStart, end: blockEnd, text })
    }
  }

  while (index < section.end) {
    if (!lines[index].trim()) {
      index += 1
      start = index
      continue
    }
    if (/^\s*\|/.test(lines[index])) {
      start = index
      while (index < section.end && /^\s*\|/.test(lines[index])) index += 1
      pushBlock(start, index)
      start = index
      continue
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(lines[index])) {
      start = index
      while (index < section.end && /^\s*([-*]|\d+\.)\s+/.test(lines[index])) index += 1
      pushBlock(start, index)
      start = index
      continue
    }
    start = index
    while (
      index < section.end &&
      lines[index].trim() &&
      !/^\s*\|/.test(lines[index]) &&
      !/^\s*([-*]|\d+\.)\s+/.test(lines[index])
    ) {
      index += 1
    }
    pushBlock(start, index)
    start = index
  }

  return blocks
}

function findChartImageInsertPosition(lines, section, keywords) {
  const blocks = splitSectionBlocks(lines, section)
  let best = { score: 0, end: section.end }
  blocks.forEach(block => {
    const score = scoreReportText(block.text, keywords)
    if (score > best.score) {
      best = { score, end: block.end }
    }
  })
  return best.score > 0 ? best.end : section.end
}

function getChartImagePlacements(markdown, chartImages) {
  const { lines, sections } = splitReportSections(markdown)
  const fallbackPosition = lines.length
  const fallback = []
  const placements = new Map()

  ;(chartImages || []).forEach(image => {
    const keywords = image.keywords?.length ? image.keywords : buildChartImageKeywords(image)
    let bestSection = null
    let bestScore = 0

    sections.forEach(section => {
      const headingScore = scoreReportText(section.heading, keywords) * 2
      const bodyScore = scoreReportText(section.text, keywords)
      const score = headingScore + bodyScore
      if (score > bestScore) {
        bestScore = score
        bestSection = section
      }
    })

    if (!bestSection || bestScore < 3) {
      fallback.push(image)
      return
    }

    const position = findChartImageInsertPosition(lines, bestSection, keywords)
    const existing = placements.get(position) || []
    existing.push({ image, fallback: false })
    placements.set(position, existing)
  })

  if (fallback.length) {
    placements.set(fallbackPosition, [
      ...(placements.get(fallbackPosition) || []),
      ...fallback.map(image => ({ image, fallback: true }))
    ])
  }

  return {
    lines,
    placements
  }
}

function escapeMarkdownAlt(value) {
  return String(value ?? 'Chart').replace(/[\r\n]+/g, ' ').replace(/]/g, '\\]')
}

function chartImageMarkdownBlock(image) {
  const title = image.title || 'Chart'
  const lines = [
    `> **Chart evidence: ${title}**`
  ]
  if (image.explanation) {
    lines.push(`> ${String(image.explanation).replace(/\r?\n/g, ' ')}`)
  }
  lines.push('', `![${escapeMarkdownAlt(title)}](${image.dataUrl})`)
  return lines.join('\n')
}

function reportFallbackChartHeading() {
  return 'Related charts'
}

function chartPlacementImages(entries, fallback) {
  return (entries || [])
    .filter(entry => !!entry?.fallback === fallback)
    .map(entry => entry.image)
    .filter(Boolean)
}

function buildReportMarkdownWithChartImages(markdown, chartImages) {
  if (!chartImages?.length) return markdown
  const { lines, placements } = getChartImagePlacements(markdown, chartImages)
  const out = []

  for (let index = 0; index < lines.length; index++) {
    out.push(lines[index])
    const entries = placements.get(index + 1)
    if (entries?.length) {
      const inlineCharts = chartPlacementImages(entries, false)
      const fallbackCharts = chartPlacementImages(entries, true)
      if (inlineCharts.length) {
        out.push('', ...inlineCharts.map(chartImageMarkdownBlock))
      }
      if (fallbackCharts.length) {
        out.push('', `## ${reportFallbackChartHeading()}`, '', ...fallbackCharts.map(chartImageMarkdownBlock))
      }
    }
  }

  return `${out.join('\n').replace(/\n{4,}/g, '\n\n\n').trim()}\n`
}

function chartImageFigureHtml(image) {
  const title = image.title || 'Chart'
  return `
    <figure class="chart-image">
      <div class="chart-image__meta">
        <span class="chart-image__eyebrow">Chart evidence</span>
        <figcaption>${escapeHtml(title)}</figcaption>
      </div>
      ${image.explanation ? `<p>${escapeHtml(image.explanation)}</p>` : ''}
      <img src="${escapeAttribute(image.dataUrl)}" alt="${escapeAttribute(title)}" />
    </figure>`
}

function chartImagesHtml(chartImages) {
  if (!chartImages?.length) return ''
  return chartImages.map(chartImageFigureHtml).join('')
}

function buildReportHtmlWithChartImages(markdown, chartImages) {
  if (!chartImages?.length) return formatAnswerHtml(markdown)
  const { lines, placements } = getChartImagePlacements(markdown, chartImages)
  const positions = Array.from(placements.keys()).sort((a, b) => a - b)
  let cursor = 0
  let html = ''

  positions.forEach(position => {
    const segment = lines.slice(cursor, position).join('\n').trim()
    if (segment) html += formatAnswerHtml(segment)
    const entries = placements.get(position) || []
    const inlineCharts = chartPlacementImages(entries, false)
    const fallbackCharts = chartPlacementImages(entries, true)
    if (inlineCharts.length) {
      html += chartImagesHtml(inlineCharts)
    }
    if (fallbackCharts.length) {
      html += `<section class="chart-image-section"><h2>${escapeHtml(reportFallbackChartHeading())}</h2>${chartImagesHtml(fallbackCharts)}</section>`
    }
    cursor = position
  })

  const tail = lines.slice(cursor).join('\n').trim()
  if (tail) html += formatAnswerHtml(tail)
  return html || formatAnswerHtml(markdown)
}

function nextAnimationFrame() {
  return new Promise(resolve => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))
  })
}

const REPORT_PDF_PAGE_SIZE_MM = { width: 210, height: 297 }
const REPORT_PDF_MARGIN_MM = [20, 12, 18, 12]
const REPORT_PDF_SAFE_PAGE_RATIO = 0.94
const REPORT_PDF_MAX_PAGINATION_PASSES = 80

function reportPdfInnerPageSize(margin = REPORT_PDF_MARGIN_MM) {
  return {
    width: REPORT_PDF_PAGE_SIZE_MM.width - margin[1] - margin[3],
    height: REPORT_PDF_PAGE_SIZE_MM.height - margin[0] - margin[2]
  }
}

function reportPdfPageHeightPx(element, margin = REPORT_PDF_MARGIN_MM) {
  const rect = element.getBoundingClientRect()
  const page = reportPdfInnerPageSize(margin)
  const width = rect.width || element.scrollWidth || 794
  return Math.max(600, Math.floor(width * page.height / page.width))
}

function isReportPaginationBreak(node) {
  return node?.nodeType === 1 && (
    node.classList.contains('report-pagination-spacer') ||
    node.classList.contains('html2pdf__page-break') ||
    node.classList.contains('page-break-before')
  )
}

function isReportHeadingElement(node) {
  return node?.nodeType === 1 && /^H[2-4]$/.test(node.tagName || '')
}

function isReportWhitespaceNode(node) {
  return node?.nodeType === 3 && !String(node.textContent || '').trim()
}

function nextReportElement(node) {
  let current = node
  while (current) {
    if (isReportWhitespaceNode(current)) {
      current = current.nextSibling
      continue
    }
    return current.nodeType === 1 ? current : null
  }
  return null
}

function isReportBlockTooTall(node, pageHeightPx) {
  return Number.isFinite(pageHeightPx) &&
    pageHeightPx > 0 &&
    node.getBoundingClientRect().height > pageHeightPx * REPORT_PDF_SAFE_PAGE_RATIO
}

function markReportTablesForPagination(root, pageHeightPx = null) {
  root.querySelectorAll('.table-wrapper').forEach(wrapper => {
    const table = wrapper.querySelector('table')
    if (!table) return
    const rowCount = table.querySelectorAll('tbody tr').length
    const isLong = rowCount > 12 || isReportBlockTooTall(wrapper, pageHeightPx)
    wrapper.classList.toggle('table-wrapper--long', isLong)
    wrapper.classList.toggle('table-wrapper--short', !isLong)
    table.classList.toggle('is-long-table', isLong)
    table.classList.toggle('is-short-table', !isLong)
    wrapper.classList.toggle('report-block', !isLong)
  })
}

function markReportListsForPagination(root, pageHeightPx = null) {
  root.querySelectorAll('ul, ol').forEach(list => {
    const itemCount = list.querySelectorAll(':scope > li').length
    const isLong = itemCount > 8 || isReportBlockTooTall(list, pageHeightPx)
    list.classList.toggle('report-list--long', isLong)
    list.classList.toggle('report-list--short', !isLong)
    list.classList.toggle('report-block', !isLong)
  })
  root.querySelectorAll('li').forEach(item => {
    item.classList.add('report-list-item')
  })
}

function markReportBlocksForPagination(root, pageHeightPx = null) {
  root.querySelectorAll('p, blockquote, pre').forEach(node => {
    if (node.closest('.chart-image')) return
    node.classList.add('report-block')
  })
  root.querySelectorAll('.chart-image').forEach(node => {
    node.classList.add('report-block')
  })
  root.querySelectorAll('.chart-image-section').forEach(node => {
    node.classList.add('report-chart-section')
    node.classList.remove('report-block')
  })
  markReportListsForPagination(root, pageHeightPx)
  markReportTablesForPagination(root, pageHeightPx)
}

function groupReportHeadingsForPagination(root) {
  const headings = Array.from(root.querySelectorAll('h2, h3, h4'))
    .filter(heading => !heading.closest('.chart-image, .chart-image-section, .report-heading-group'))

  headings.forEach(heading => {
    const parent = heading.parentNode
    if (!parent) return
    const wrapper = document.createElement('div')
    wrapper.className = 'report-heading-group report-block'
    parent.insertBefore(wrapper, heading)
    wrapper.appendChild(heading)

    const next = nextReportElement(wrapper.nextSibling)
    if (
      next &&
      !isReportHeadingElement(next) &&
      !isReportPaginationBreak(next) &&
      !next.classList.contains('report-footer')
    ) {
      wrapper.appendChild(next)
    }
  })
}

function splitTextIntoReportChunks(text, maxLength = 420) {
  const source = String(text || '').replace(/\s+/g, ' ').trim()
  if (!source || source.length <= maxLength) return [source]
  const parts = source
    .split(/(?<=[。！？；.!?;])\s+/)
    .map(item => item.trim())
    .filter(Boolean)
  const chunks = []
  let current = ''
  const queue = parts.length ? parts : source.split(/\s+/)
  queue.forEach(part => {
    const candidate = current ? `${current} ${part}` : part
    if (candidate.length > maxLength && current) {
      chunks.push(current)
      current = part
    } else {
      current = candidate
    }
  })
  if (current) chunks.push(current)
  return chunks.length ? chunks : [source]
}

function splitOversizedReportTextBlocks(root, pageHeightPx) {
  const maxBlockHeight = pageHeightPx * REPORT_PDF_SAFE_PAGE_RATIO
  const textBlocks = Array.from(root.querySelectorAll('p.report-block, li.report-list-item'))
    .filter(node => !node.closest('.chart-image'))

  textBlocks.forEach(node => {
    if (node.getBoundingClientRect().height <= maxBlockHeight) return
    const chunks = splitTextIntoReportChunks(node.textContent, node.tagName === 'LI' ? 360 : 460)
    if (chunks.length <= 1) return
    const replacements = chunks.map(chunk => {
      const clone = node.cloneNode(false)
      clone.textContent = chunk
      return clone
    })
    replacements.forEach(replacement => node.parentNode.insertBefore(replacement, node))
    node.parentNode.removeChild(node)
  })
}

function fitOversizedReportFigures(root, pageHeightPx) {
  const maxBlockHeight = pageHeightPx * REPORT_PDF_SAFE_PAGE_RATIO
  root.querySelectorAll('.chart-image').forEach(figure => {
    const rect = figure.getBoundingClientRect()
    if (rect.height <= maxBlockHeight) return
    figure.classList.add('chart-image--oversized')
    const image = figure.querySelector('img')
    if (image) {
      image.style.maxHeight = `${Math.max(220, Math.floor(maxBlockHeight - 120))}px`
      image.style.objectFit = 'contain'
    }
  })
}

function reportElementCrossesPage(element, rootTop, pageHeightPx) {
  const rect = element.getBoundingClientRect()
  const top = rect.top - rootTop
  const bottom = rect.bottom - rootTop
  if (bottom <= top || rect.height <= 0) return false
  return Math.floor(top / pageHeightPx) !== Math.floor((bottom - 1) / pageHeightPx)
}

function hasPageBreakBefore(element) {
  let current = element.previousSibling
  while (current && isReportWhitespaceNode(current)) current = current.previousSibling
  return isReportPaginationBreak(current)
}

function reportPaginationOffset(element, root) {
  const rootTop = root.getBoundingClientRect().top
  const top = element.getBoundingClientRect().top - rootTop
  return top >= 0 ? top : 0
}

function reportPaginationSpacerHeight(element, root, pageHeightPx) {
  const top = reportPaginationOffset(element, root)
  const offset = ((top % pageHeightPx) + pageHeightPx) % pageHeightPx
  if (offset <= 1) return 0
  return Math.max(1, Math.ceil(pageHeightPx - offset + 1))
}

function insertReportPageBreakBefore(element, root, pageHeightPx) {
  if (!element?.parentNode || hasPageBreakBefore(element)) return false
  const breaker = document.createElement('div')
  const spacerHeight = reportPaginationSpacerHeight(element, root, pageHeightPx)
  if (!spacerHeight) return false
  breaker.className = 'report-pagination-spacer'
  breaker.setAttribute('aria-hidden', 'true')
  breaker.style.cssText = [
    `height:${spacerHeight}px`,
    'display:block',
    'width:100%',
    'margin:0',
    'padding:0',
    'border:0',
    'line-height:0',
    'font-size:0',
    'overflow:hidden',
    'background:#ffffff'
  ].join(';')
  breaker.dataset.reportSpacerHeight = String(spacerHeight)
  element.parentNode.insertBefore(breaker, element)
  return true
}

function cloneReportListShell(list, firstMovedItem) {
  const clone = list.cloneNode(false)
  if (list.tagName === 'OL') {
    const items = Array.from(list.children).filter(child => child.tagName === 'LI')
    const previousCount = Math.max(0, items.indexOf(firstMovedItem))
    const originalStart = Number.parseInt(list.getAttribute('start') || '1', 10)
    clone.setAttribute('start', String((Number.isFinite(originalStart) ? originalStart : 1) + previousCount))
  }
  clone.className = list.className
  if (firstMovedItem?.value && list.tagName === 'OL') clone.setAttribute('start', String(firstMovedItem.value))
  return clone
}

function splitReportListBeforeItem(item, root, pageHeightPx) {
  const list = item?.parentElement
  if (!list || !['UL', 'OL'].includes(list.tagName)) return false
  const firstItem = Array.from(list.children).find(child => child.tagName === 'LI')
  if (item === firstItem) return insertReportPageBreakBefore(list, root, pageHeightPx)

  const spacerHeight = reportPaginationSpacerHeight(item, root, pageHeightPx)
  const continuation = cloneReportListShell(list, item)
  let current = item
  while (current) {
    const next = current.nextSibling
    continuation.appendChild(current)
    current = next
  }

  const breaker = document.createElement('div')
  breaker.className = 'report-pagination-spacer'
  breaker.setAttribute('aria-hidden', 'true')
  breaker.style.cssText = [
    `height:${Math.max(1, spacerHeight)}px`,
    'display:block',
    'width:100%',
    'margin:0',
    'padding:0',
    'border:0',
    'line-height:0',
    'font-size:0',
    'overflow:hidden',
    'background:#ffffff'
  ].join(';')
  breaker.dataset.reportSpacerHeight = String(Math.max(1, spacerHeight))
  list.parentNode.insertBefore(breaker, list.nextSibling)
  list.parentNode.insertBefore(continuation, breaker.nextSibling)
  return true
}

function splitReportTableBeforeRow(row, root, pageHeightPx) {
  const tbody = row?.parentElement
  const table = row?.closest('table')
  if (!tbody || !table || tbody.tagName !== 'TBODY') return false
  const firstRow = Array.from(tbody.children).find(child => child.tagName === 'TR')
  const wrapper = table.closest('.table-wrapper') || table
  if (row === firstRow) return insertReportPageBreakBefore(wrapper, root, pageHeightPx)

  const spacerHeight = reportPaginationSpacerHeight(row, root, pageHeightPx)
  const wrapperClone = wrapper === table ? table.cloneNode(false) : wrapper.cloneNode(false)
  const tableClone = wrapper === table ? wrapperClone : table.cloneNode(false)
  const thead = table.querySelector('thead')
  if (thead) tableClone.appendChild(thead.cloneNode(true))
  const tbodyClone = document.createElement('tbody')
  let current = row
  while (current) {
    const next = current.nextSibling
    tbodyClone.appendChild(current)
    current = next
  }
  tableClone.appendChild(tbodyClone)
  if (wrapper !== table) {
    wrapperClone.appendChild(tableClone)
  }

  const breaker = document.createElement('div')
  breaker.className = 'report-pagination-spacer'
  breaker.setAttribute('aria-hidden', 'true')
  breaker.style.cssText = [
    `height:${Math.max(1, spacerHeight)}px`,
    'display:block',
    'width:100%',
    'margin:0',
    'padding:0',
    'border:0',
    'line-height:0',
    'font-size:0',
    'overflow:hidden',
    'background:#ffffff'
  ].join(';')
  breaker.dataset.reportSpacerHeight = String(Math.max(1, spacerHeight))
  wrapper.parentNode.insertBefore(breaker, wrapper.nextSibling)
  wrapper.parentNode.insertBefore(wrapperClone, breaker.nextSibling)
  return true
}

function reportPaginationBlocks(root) {
  const selectors = [
    '.report-heading-group',
    'p.report-block',
    'ul.report-block',
    'ol.report-block',
    'blockquote.report-block',
    'pre.report-block',
    '.chart-image',
    '.table-wrapper--short',
    'table.is-short-table',
    '.report-list--long > li.report-list-item',
    'table.is-long-table tbody tr'
  ]
  return Array.from(root.querySelectorAll(selectors.join(',')))
    .filter(node => !isReportPaginationBreak(node))
}

function insertBreakForReportPaginationBlock(block, root, pageHeightPx) {
  if (block.tagName === 'LI' && block.parentElement?.classList.contains('report-list--long')) {
    return splitReportListBeforeItem(block, root, pageHeightPx)
  }
  if (block.tagName === 'TR' && block.closest('table.is-long-table')) {
    return splitReportTableBeforeRow(block, root, pageHeightPx)
  }
  return insertReportPageBreakBefore(block, root, pageHeightPx)
}

function paginateReportPdfElement(root, pageHeightPx) {
  let breaksInserted = 0
  let pass = 0
  let changed = true

  while (changed && pass < REPORT_PDF_MAX_PAGINATION_PASSES) {
    changed = false
    pass += 1
    const rootTop = root.getBoundingClientRect().top
    const blocks = reportPaginationBlocks(root)

    for (const block of blocks) {
      const rect = block.getBoundingClientRect()
      if (rect.height <= 0 || rect.height > pageHeightPx * REPORT_PDF_SAFE_PAGE_RATIO) continue
      if (reportElementCrossesPage(block, rootTop, pageHeightPx) && insertBreakForReportPaginationBlock(block, root, pageHeightPx)) {
        breaksInserted += 1
        changed = true
        markReportBlocksForPagination(root, pageHeightPx)
        break
      }
    }
  }

  return {
    pageHeightPx,
    pageCount: Math.max(1, Math.ceil(root.scrollHeight / pageHeightPx)),
    breaksInserted,
    passes: pass,
    violations: collectReportPaginationViolations(root, pageHeightPx)
  }
}

function collectReportPaginationViolations(root, pageHeightPx) {
  const rootTop = root.getBoundingClientRect().top
  const selectors = [
    '.report-heading-group',
    'p.report-block',
    'li.report-list-item',
    'blockquote.report-block',
    'pre.report-block',
    '.chart-image',
    '.chart-image img',
    '.table-wrapper--short',
    'table.is-short-table',
    'tr'
  ]
  const seen = new Set()
  const violations = []
  root.querySelectorAll(selectors.join(',')).forEach(node => {
    if (seen.has(node)) return
    seen.add(node)
    const rect = node.getBoundingClientRect()
    if (rect.height <= 0 || rect.height > pageHeightPx * REPORT_PDF_SAFE_PAGE_RATIO) return
    if (!reportElementCrossesPage(node, rootTop, pageHeightPx)) return
    violations.push({
      tag: node.tagName,
      className: node.className || '',
      text: String(node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      top: Math.round(rect.top - rootTop),
      bottom: Math.round(rect.bottom - rootTop),
      height: Math.round(rect.height)
    })
  })
  return violations
}

async function waitForReportPaginationAssets(root) {
  const images = Array.from(root.querySelectorAll('img'))
  await Promise.all(images.map(image => {
    if (image.complete && image.naturalWidth > 0) return Promise.resolve()
    return new Promise(resolve => {
      image.addEventListener('load', resolve, { once: true })
      image.addEventListener('error', resolve, { once: true })
    })
  }))
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready
    } catch (error) {
      // Font readiness is a layout optimization; ignore unsupported browser failures.
    }
  }
  await nextAnimationFrame()
}

async function prepareReportPdfElementForExport(element, margin = REPORT_PDF_MARGIN_MM) {
  markReportBlocksForPagination(element)
  groupReportHeadingsForPagination(element)
  await waitForReportPaginationAssets(element)
  const pageHeightPx = reportPdfPageHeightPx(element, margin)
  splitOversizedReportTextBlocks(element, pageHeightPx)
  markReportBlocksForPagination(element, pageHeightPx)
  fitOversizedReportFigures(element, pageHeightPx)
  await nextAnimationFrame()
  const diagnostics = paginateReportPdfElement(element, pageHeightPx)
  window.__assistantReportPaginationDiagnostics = diagnostics
  if (diagnostics.violations.length) {
    console.warn('Report PDF pagination violations:', diagnostics.violations)
  }
  return diagnostics
}

function openReportPreviewWindow(title, html, ts, existingWindow = null) {
  const win = existingWindow || window.open('', '_blank')
  if (!win) return false
  win.document.open()
  win.document.write(`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  html, body { margin: 0; padding: 0; background: #ffffff; overflow-x: hidden; }
  body { width: min(760px, calc(100% - 40px)); box-sizing: border-box; font-family: "PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif; font-size: 13px; line-height: 1.75; color: #1e293b; margin: 0 auto; padding: 36px 0; }
  body, body * { box-sizing: border-box; }
  h1 { font-size: 21px; text-align: center; margin: 0 0 6px; letter-spacing: 1px; }
  h2 { font-size: 16px; margin: 26px 0 8px; padding-bottom: 5px; border-bottom: 2px solid #0f766e; color: #0f766e; }
  h3 { font-size: 14px; margin: 18px 0 6px; }
  h2, h3, h4 { break-after: avoid; page-break-after: avoid; }
  p { margin: 2px 0 8px; }
  p, li, blockquote, pre, .report-block, .report-heading-group { break-inside: avoid; page-break-inside: avoid; }
  .table-wrapper { max-width: 100%; overflow: hidden; margin: 10px 0; }
  .table-wrapper--short,
  table.is-short-table { break-inside: avoid; page-break-inside: avoid; }
  .table-wrapper--long,
  table.is-long-table { break-inside: auto; page-break-inside: auto; }
  table { border-collapse: collapse; width: 100%; max-width: 100%; table-layout: fixed; margin: 10px 0; font-size: 11.5px; line-height: 1.5; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th { background: #0f766e; color: #fff; font-weight: 700; padding: 7px 8px; text-align: center; border: 1px solid #0b5e58; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
  td { padding: 5px 8px; border: 1px solid #d4d4d8; text-align: left; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
  table.dense th, table.dense td { padding: 3px 6px; font-size: 10.5px; }
  table.wide th, table.wide td { padding: 4px 7px; font-size: 11px; }
  tr:nth-child(even) td { background: #f8fafc; }
  pre { background: #1e293b; color: #e2e8f0; border-radius: 5px; padding: 10px 14px; font-size: 11px; line-height: 1.5; overflow-x: auto; white-space: pre-wrap; }
  code { font-family: "JetBrains Mono",Consolas,monospace; font-size: 0.9em; background: #f1f5f9; padding: 1px 4px; border-radius: 3px; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 6px 0; padding: 7px 12px; border: 1px solid #d8e0e8; border-radius: 6px; background: #f8fafc; color: #64748b; font-size: 12px; }
  .chart-image-section { max-width: 100%; margin-top: 24px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
  .chart-image { max-width: 100%; margin: 12px 0 20px; padding: 11px 12px 12px; border: 1px solid #d8e0e8; border-radius: 8px; background: #fbfdff; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
  .chart-image__meta { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #e8eef4; }
  .chart-image__eyebrow { flex-shrink: 0; color: #64748b; font-size: 10.5px; font-weight: 600; }
  .chart-image figcaption { flex: 1; min-width: 0; color: #0f766e; font-size: 13px; font-weight: 700; line-height: 1.35; text-align: right; overflow-wrap: anywhere; word-break: break-word; }
  .chart-image p { margin: 0 0 8px; color: #526170; font-size: 12px; line-height: 1.55; }
  .chart-image img { display: block; width: 100%; max-width: 100%; height: auto; object-fit: contain; border: 1px solid #edf2f7; border-radius: 6px; background: #fff; }
  .chart-image--oversized img { max-height: 185mm; }
  .report-pagination-spacer { display: block; width: 100%; margin: 0; padding: 0; border: 0; line-height: 0; font-size: 0; overflow: hidden; background: #fff; }
  .page-break-before { display: block; height: 0; page-break-after: always; break-after: page; }
  .report-footer { margin-top: 32px; padding-top: 10px; border-top: 1px solid #cbd5e1; text-align: center; color: #94a3b8; font-size: 11px; }
  @media print { html, body { width: auto; max-width: none; overflow: visible; } body { width: 100%; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } @page { margin: 15mm 14mm; size: A4; } }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<div class="report-footer">Generated at: ${escapeHtml(ts)}</div>
<hr>
${html}
<div class="report-footer">- Generated by EnergyStorageAgent V8 -</div>
</body>
</html>`)
  win.document.close()
  win.focus()
  return true
}

function firstReportSummaryTitle(text) {
  const line = String(text ?? '').split(/\r?\n/).map(item => item.trim()).find(Boolean)
  if (!line) return ''
  const cleaned = line
    .replace(/^[\s✅]+/, '')
    .replace(/^(Generated|Created|Prepared|Completed)\s+(the\s+)?/i, '')
    .replace(/[,.;:].*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned || /[\u3400-\u9fff]/.test(cleaned)) return ''
  return cleaned.length > 80 ? cleaned.slice(0, 80).trim() : cleaned
}

function reportFileTitle(chatContent, response) {
  const reportTitle = getStructuredReport(response)?.title
  if (reportTitle) return String(reportTitle)
  const fromContent = firstReportSummaryTitle(chatContent)
  if (fromContent) return fromContent
  const title = response?.display?.title
  if (title && !/[\u3400-\u9fff]/.test(title)) return String(title)
  return 'Analysis Report'
}

function safeFilenamePart(value) {
  return String(value ?? 'Analysis Report')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Analysis_Report'
}

function buildReportFilename(title, extension = 'md') {
  const ts = new Date().toISOString().slice(0, 10)
  return `${ts}_${safeFilenamePart(title)}.${extension.replace(/^\./, '')}`
}

function normalizeReportHeadingText(value) {
  return normalizeReportText(stripMarkdownSyntax(value)).replace(/\s+/g, ' ')
}

function removeDuplicateReportTitleHeading(markdown, title) {
  const lines = String(markdown ?? '').replace(/\r\n/g, '\n').split('\n')
  const firstIndex = lines.findIndex(line => line.trim())
  if (firstIndex < 0) return markdown
  const heading = /^#\s+(.+)$/.exec(lines[firstIndex].trim())
  if (!heading) return markdown
  if (normalizeReportHeadingText(heading[1]) !== normalizeReportHeadingText(title)) return markdown

  let nextIndex = firstIndex + 1
  while (nextIndex < lines.length && !lines[nextIndex].trim()) nextIndex += 1
  return [...lines.slice(0, firstIndex), ...lines.slice(nextIndex)].join('\n').trim()
}

function shortenReportFilename(filename) {
  const value = String(filename || '')
  return value.length > 28 ? `${value.slice(0, 24)}...${value.slice(-6)}` : value
}

function createReportPdfElement(title, html, ts) {
  const element = document.createElement('article')
  element.className = 'assistant-report-pdf-export'
  element.style.cssText = [
    'position: static',
    'width: 186mm',
    'max-width: 186mm',
    'padding: 9mm 6mm',
    'box-sizing: border-box',
    'overflow: hidden',
    'background: #ffffff',
    'color: #1e293b',
    'font-family: "PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif',
    'font-size: 13px',
    'line-height: 1.75',
    'pointer-events: none'
  ].join(';')
  element.innerHTML = `
<style>
  .assistant-report-pdf-export,
  .assistant-report-pdf-export * { box-sizing: border-box; }
  .assistant-report-pdf-export h1 { font-size: 21px; text-align: center; margin: 0 0 6px; letter-spacing: 1px; }
  .assistant-report-pdf-export h2 { font-size: 16px; margin: 26px 0 8px; padding-bottom: 5px; border-bottom: 2px solid #0f766e; color: #0f766e; }
  .assistant-report-pdf-export h3 { font-size: 14px; margin: 18px 0 6px; }
  .assistant-report-pdf-export h4 { font-size: 13px; margin: 14px 0 4px; }
  .assistant-report-pdf-export h2,
  .assistant-report-pdf-export h3,
  .assistant-report-pdf-export h4 { break-after: avoid; page-break-after: avoid; }
  .assistant-report-pdf-export p { margin: 2px 0 8px; }
  .assistant-report-pdf-export p,
  .assistant-report-pdf-export li,
  .assistant-report-pdf-export blockquote,
  .assistant-report-pdf-export pre,
  .assistant-report-pdf-export .report-block,
  .assistant-report-pdf-export .report-heading-group { break-inside: avoid; page-break-inside: avoid; }
  .assistant-report-pdf-export strong { color: #0c4a6e; }
  .assistant-report-pdf-export ul,
  .assistant-report-pdf-export ol { margin: 4px 0; padding-left: 20px; }
  .assistant-report-pdf-export li { margin-bottom: 2px; }
  .assistant-report-pdf-export pre { background: #1e293b; color: #e2e8f0; border-radius: 5px; padding: 10px 14px; font-size: 11px; line-height: 1.5; overflow-x: auto; white-space: pre-wrap; font-family: "JetBrains Mono",Consolas,monospace; }
  .assistant-report-pdf-export code { font-family: "JetBrains Mono",Consolas,monospace; font-size: 0.9em; background: #f1f5f9; padding: 1px 4px; border-radius: 3px; }
  .assistant-report-pdf-export pre code { background: none; padding: 0; }
  .assistant-report-pdf-export blockquote { margin: 6px 0; padding: 7px 12px; border: 1px solid #d8e0e8; border-radius: 6px; background: #f8fafc; color: #64748b; font-size: 12px; }
  .assistant-report-pdf-export hr { border: none; border-top: 1px solid #cbd5e1; margin: 10px 0; }
  .assistant-report-pdf-export a { color: #2563eb; }
  .assistant-report-pdf-export .table-wrapper { max-width: 100%; overflow: hidden; margin: 10px 0; }
  .assistant-report-pdf-export .table-wrapper--short,
  .assistant-report-pdf-export table.is-short-table { page-break-inside: avoid; break-inside: avoid; }
  .assistant-report-pdf-export .table-wrapper--long,
  .assistant-report-pdf-export table.is-long-table { page-break-inside: auto; break-inside: auto; }
  .assistant-report-pdf-export table { border-collapse: collapse; width: 100%; max-width: 100%; table-layout: fixed; margin: 10px 0; font-size: 11.5px; line-height: 1.5; }
  .assistant-report-pdf-export thead { display: table-header-group; }
  .assistant-report-pdf-export tr { page-break-inside: avoid; break-inside: avoid; }
  .assistant-report-pdf-export th { background: #0f766e; color: #fff; font-weight: 700; padding: 7px 8px; text-align: center; border: 1px solid #0b5e58; font-size: 11.5px; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
  .assistant-report-pdf-export td { padding: 5px 8px; border: 1px solid #d4d4d8; text-align: left; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
  .assistant-report-pdf-export tr:nth-child(even) td { background: #f8fafc; }
  .assistant-report-pdf-export tr:nth-child(odd) td { background: #fff; }
  .assistant-report-pdf-export table.dense th,
  .assistant-report-pdf-export table.dense td { padding: 3px 6px; font-size: 10.5px; }
  .assistant-report-pdf-export table.wide th,
  .assistant-report-pdf-export table.wide td { padding: 4px 7px; font-size: 11px; }
  .assistant-report-pdf-export .chart-image-section { max-width: 100%; margin-top: 24px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
  .assistant-report-pdf-export .chart-image { max-width: 100%; margin: 12px 0 20px; padding: 11px 12px 12px; border: 1px solid #d8e0e8; border-radius: 8px; background: #fbfdff; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
  .assistant-report-pdf-export .chart-image__meta { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #e8eef4; }
  .assistant-report-pdf-export .chart-image__eyebrow { flex-shrink: 0; color: #64748b; font-size: 10.5px; font-weight: 600; }
  .assistant-report-pdf-export .chart-image figcaption { flex: 1; min-width: 0; color: #0f766e; font-size: 13px; font-weight: 700; line-height: 1.35; text-align: right; overflow-wrap: anywhere; word-break: break-word; }
  .assistant-report-pdf-export .chart-image p { margin: 0 0 8px; color: #526170; font-size: 12px; line-height: 1.55; }
  .assistant-report-pdf-export .chart-image img { display: block; width: 100%; max-width: 100%; height: auto; object-fit: contain; border: 1px solid #edf2f7; border-radius: 6px; background: #fff; }
  .assistant-report-pdf-export .chart-image--oversized img { max-height: 185mm; }
  .assistant-report-pdf-export .report-footer { margin-top: 32px; padding-top: 10px; border-top: 1px solid #cbd5e1; text-align: center; color: #94a3b8; font-size: 11px; }
  .assistant-report-pdf-export .report-pagination-spacer { display: block; width: 100%; margin: 0; padding: 0; border: 0; line-height: 0; font-size: 0; overflow: hidden; background: #fff; }
  .assistant-report-pdf-export .page-break { page-break-before: always; break-before: page; }
  .assistant-report-pdf-export .page-break-before { display: block; height: 0; page-break-after: always; break-after: page; }
</style>
<h1>${escapeHtml(title)}</h1>
<div class="report-footer">Generated at: ${escapeHtml(ts)}</div>
<hr>
${html}
<div class="report-footer">- Generated by EnergyStorageAgent V8 -</div>`
  return element
}

function addReportPdfPageChrome(pdf, { title, generatedAt } = {}) {
  if (!pdf?.internal) return
  const pageCount = Number(pdf.internal.getNumberOfPages?.() || 0)
  if (!pageCount) return

  const pageSize = pdf.internal.pageSize || {}
  const pageWidth = typeof pageSize.getWidth === 'function' ? pageSize.getWidth() : pageSize.width
  const pageHeight = typeof pageSize.getHeight === 'function' ? pageSize.getHeight() : pageSize.height
  if (!Number.isFinite(pageWidth) || !Number.isFinite(pageHeight)) return

  const left = 12
  const right = pageWidth - 12
  const headerY = 11
  const headerLineY = 15
  const footerLineY = pageHeight - 15
  const footerY = pageHeight - 8.5
  const headerTitle = pdfChromeText(title || 'Operation Report', 72)
  const generatedText = pdfChromeText(`Generated ${generatedAt || ''}`, 72)

  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page)
    pdf.setDrawColor(203, 213, 225)
    pdf.setLineWidth(0.18)
    pdf.line(left, headerLineY, right, headerLineY)
    pdf.line(left, footerLineY, right, footerLineY)

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(71, 85, 105)
    pdf.text(headerTitle, left, headerY)
    pdf.text('EnergyStorageAgent V8', right, headerY, { align: 'right' })
    pdf.text(generatedText, left, footerY)
    pdf.text(`Page ${page} / ${pageCount}`, right, footerY, { align: 'right' })
  }
}

function pdfChromeText(value, maxLength = 72) {
  const raw = String(value ?? '')
  const normalized = typeof raw.normalize === 'function' ? raw.normalize('NFKD') : raw
  const ascii = normalized
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const fallback = ascii || 'Operation Report'
  return fallback.length > maxLength ? `${fallback.slice(0, maxLength - 3)}...` : fallback
}

const CHART_FONT_FAMILY = '"Times New Roman", "SimSun", serif'
const CHART_COLORS = ['#2f5597', '#a23e2b', '#3c7d59', '#7b4d8a', '#b07820', '#4a4a4a']
const REPORT_CHART_EXPORT_WIDTH = 640
const REPORT_CHART_EXPORT_MIN_WIDTH = 560

function normalizeChartText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getChartSeriesSemantic(chartDef, item) {
  const itemText = normalizeChartText([
    item?.name,
    item?.metric,
    item?.unit,
    item?.axis,
    item?.role
  ].filter(Boolean).join(' '))
  const chartText = normalizeChartText([
    chartDef?.title,
    chartDef?.metric,
    chartDef?.unit
  ].filter(Boolean).join(' '))
  const matchSemantic = text => {
    if (/(soc|state of charge|battery soc|soc floor|soc boundary)/.test(text)) return 'soc'
    if (/(pcs|power|output|dispatch|charge|discharge|battery power|inverter)/.test(text)) return 'pcs'
    if (/(price|tariff|market|electricity|revenue|cost|cny|eur|euro|mwh|price window|spot)/.test(text)) return 'market'
    if (/(load|demand|forecast|baseline|consumption)/.test(text)) return 'load'
    if (/(threshold|limit|cap|ceiling|floor|boundary)/.test(text)) return 'threshold'
    if (/(trend|variance|delta|spread)/.test(text)) return 'trend'
    return ''
  }
  return matchSemantic(itemText) || matchSemantic(chartText)
}

function resolveChartSeriesColor(chartDef, item, index) {
  if (item?.color) return item.color
  const semantic = getChartSeriesSemantic(chartDef, item)
  if (semantic === 'soc') return CHART_COLORS[0]
  if (semantic === 'pcs') return CHART_COLORS[1]
  if (semantic === 'market') return CHART_COLORS[2]
  if (semantic === 'load') return CHART_COLORS[3]
  if (semantic === 'trend') return CHART_COLORS[4]
  if (semantic === 'threshold') return CHART_COLORS[5]
  return CHART_COLORS[index % CHART_COLORS.length]
}

function getChartSeriesUnit(chartDef, item) {
  const unit = item?.unit || item?.yUnit || item?.axisUnit || item?.unitName || chartDef?.unit || ''
  return String(unit || '').trim()
}

function getChartValidSeries(chartDef) {
  const series = Array.isArray(chartDef?.series) ? chartDef.series : []
  return series.filter(item => Array.isArray(item?.data) && item.data.length >= 2)
}

function hasRenderableChart(chartDef) {
  return getChartValidSeries(chartDef).length > 0
}

function getChartAxisType(chartDef) {
  return chartDef?.xAxisType || chartDef?.x_axis_type || 'category'
}

function getChartAxisData(chartDef) {
  return chartDef?.xAxisData || chartDef?.x_axis_data || []
}

function getChartHeight(chartDef) {
  const value = Number(chartDef?.height)
  if (Number.isFinite(value)) return Math.min(Math.max(value, 216), 300)
  if (isMarketWindowChartDefinition(chartDef)) return 250
  if (isSocPcsTrendChartDefinition(chartDef)) return 238
  return 220
}

function isMarketWindowChartDefinition(chartDef) {
  const series = Array.isArray(chartDef?.series) ? chartDef.series : []
  const semantics = new Set(series.map(item => getChartSeriesSemantic(chartDef, item)).filter(Boolean))
  const text = normalizeChartText([chartDef?.title, chartDef?.metric, chartDef?.subtitle].filter(Boolean).join(' '))
  return text.includes('market window') || (semantics.has('market') && semantics.has('pcs') && semantics.has('soc'))
}

function isSocPcsTrendChartDefinition(chartDef) {
  const series = Array.isArray(chartDef?.series) ? chartDef.series : []
  const semantics = new Set(series.map(item => getChartSeriesSemantic(chartDef, item)).filter(Boolean))
  return semantics.has('soc') && semantics.has('pcs') && !isMarketWindowChartDefinition(chartDef)
}

function getCategoryAxisData(chartDef, validSeries) {
  const explicitData = getChartAxisData(chartDef)
  if (Array.isArray(explicitData) && explicitData.length) {
    return explicitData
  }
  const firstSeries = validSeries.find(item => Array.isArray(item.data))
  if (!firstSeries) return []
  return firstSeries.data.map(item => {
    if (Array.isArray(item)) return item[0]
    if (item && typeof item === 'object') return item.name
    return item
  })
}

function getChartSeriesData(item, isTimeAxis) {
  if (isTimeAxis || !Array.isArray(item?.data)) {
    return item?.data || []
  }
  if (item.data.every(point => Array.isArray(point) && point.length >= 2)) {
    return item.data.map(point => point[1])
  }
  return item.data
}

function formatChartAxisValue(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value ?? '')
  const abs = Math.abs(number)
  if (abs >= 1000000) return `${Number((number / 1000000).toFixed(abs >= 10000000 ? 0 : 1))}M`
  if (abs >= 1000) return Number(number.toFixed(0)).toLocaleString('en-US')
  if (abs >= 100) return `${Number(number.toFixed(0))}`
  if (abs >= 10) return `${Number(number.toFixed(1))}`
  return `${Number(number.toFixed(2))}`
}

function formatChartTooltipValue(value, unit = '') {
  const number = Number(value)
  const displayValue = Number.isFinite(number) ? Number(number.toFixed(3)) : value
  return `${displayValue}${unit ? ` ${unit}` : ''}`
}

function getChartTimeExtent(validSeries) {
  const timestamps = []
  ;(validSeries || []).forEach(series => {
    ;(Array.isArray(series?.data) ? series.data : []).forEach(point => {
      const raw = Array.isArray(point) ? point[0] : point?.value?.[0]
      const time = new Date(raw).getTime()
      if (Number.isFinite(time)) timestamps.push(time)
    })
  })
  if (!timestamps.length) return null
  return {
    min: Math.min(...timestamps),
    max: Math.max(...timestamps),
    span: Math.max(...timestamps) - Math.min(...timestamps)
  }
}

function formatChartMonthDay(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return String(value ?? '')
  const pad = number => String(number).padStart(2, '0')
  return wallClock(date).slice(5,10).replace('-','/')
}

function formatChartTimeAxisLabel(value, span = 0) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return String(value ?? '')
  const pad = number => String(number).padStart(2, '0')
  if (span > 48 * 60 * 60 * 1000) {
    return formatChartMonthDay(value)
  }
  return wallClock(date).slice(11,16)
}

function formatChartTooltipTimeLabel(value, span = 0) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return String(value ?? '')
  const pad = number => String(number).padStart(2, '0')
  const dateText = wallClock(date).slice(0,10)
  if (span > 48 * 60 * 60 * 1000) return dateText
  return wallClock(date).replace('T',' ')
}

function getChartSeriesNumericValues(item) {
  const values = []
  ;(Array.isArray(item?.data) ? item.data : []).forEach(point => {
    const rawValue = Array.isArray(point) ? point[point.length - 1] : point?.value
    const value = Array.isArray(rawValue) ? rawValue[rawValue.length - 1] : rawValue
    const number = Number(value)
    if (Number.isFinite(number)) values.push(number)
  })
  return values
}

function niceChartStep(rawStep) {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1
  const exponent = Math.floor(Math.log10(rawStep))
  const fraction = rawStep / Math.pow(10, exponent)
  const niceFraction = fraction <= 1
    ? 1
    : (fraction <= 2 ? 2 : (fraction <= 5 ? 5 : 10))
  return niceFraction * Math.pow(10, exponent)
}

function resolveChartAxisExtent(values, splitNumber = 4) {
  const numericValues = (values || []).filter(value => Number.isFinite(value))
  if (!numericValues.length) return {}

  const rawMin = Math.min(...numericValues)
  const rawMax = Math.max(...numericValues)
  if (rawMin === rawMax) {
    const pad = Math.max(Math.abs(rawMin) * 0.08, 1)
    const step = niceChartStep((pad * 2) / splitNumber)
    return {
      min: Math.floor((rawMin - pad) / step) * step,
      max: Math.ceil((rawMax + pad) / step) * step
    }
  }

  const rawRange = rawMax - rawMin
  const padding = rawRange * 0.1
  let min = rawMin - padding
  let max = rawMax + padding

  if (rawMin < 0 && rawMax > 0) {
    min = Math.min(min, 0)
    max = Math.max(max, 0)
  } else if (rawMin >= 0 && rawMin / rawRange < 0.35) {
    min = 0
  } else if (rawMax <= 0 && Math.abs(rawMax) / rawRange < 0.35) {
    max = 0
  }

  const step = niceChartStep((max - min) / splitNumber)
  return {
    min: Math.floor(min / step) * step,
    max: Math.ceil(max / step) * step
  }
}

function formatChartMetricValue(value, unit = '') {
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value ?? '')
  const abs = Math.abs(number)
  const fixed = abs >= 100 ? number.toFixed(0) : number.toFixed(1)
  const display = Number(fixed).toLocaleString('en-US')
  if (!unit) return display
  return unit === '%' ? `${display}%` : `${display} ${unit}`
}

function formatChartMetricRange(min, max, unit = '') {
  if (unit === '%') {
    return `${formatChartMetricValue(min)}-${formatChartMetricValue(max, '%')}`
  }
  return `${formatChartMetricValue(min, unit)}-${formatChartMetricValue(max, unit)}`
}

function buildSocPcsTrendSummaryItems(chartDef) {
  const validSeries = getChartValidSeries(chartDef)
  const socSeries = validSeries.find(item => getChartSeriesSemantic(chartDef, item) === 'soc')
  const pcsSeries = validSeries.find(item => getChartSeriesSemantic(chartDef, item) === 'pcs')
  const items = []
  if (socSeries) {
    const values = getChartSeriesNumericValues(socSeries)
    if (values.length) {
      items.push({
        key: 'soc-range',
        label: 'SOC span',
        value: formatChartMetricRange(Math.min(...values), Math.max(...values), '%'),
        className: ''
      })
    }
  }
  if (pcsSeries) {
    const values = getChartSeriesNumericValues(pcsSeries)
    if (values.length) {
      const peak = values.reduce((current, value) => Math.abs(value) > Math.abs(current) ? value : current, values[0])
      items.push({
        key: 'pcs-peak',
        label: 'PCS peak',
        value: formatChartMetricValue(peak, getChartSeriesUnit(chartDef, pcsSeries) || 'kW'),
        className: peak >= 0 ? 'assistant-chart__summary-item--up' : 'assistant-chart__summary-item--down'
      })
    }
  }
  return items.slice(0, 2)
}

function escapeChartText(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => {
    switch (char) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      case "'": return '&#39;'
      default: return char
    }
  })
}

function normalizeChartMarkConfig(config, defaults = {}) {
  if (!config) return null
  const normalized = Array.isArray(config)
    ? { data: config.slice() }
    : (typeof config === 'object' ? { ...config } : null)
  if (!normalized) return null

  if (defaults.silent != null && normalized.silent == null) {
    normalized.silent = defaults.silent
  }
  if (defaults.symbol != null && normalized.symbol == null) {
    normalized.symbol = defaults.symbol
  }
  if (defaults.label) {
    normalized.label = { ...defaults.label, ...(normalized.label || {}) }
  }
  if (defaults.itemStyle) {
    normalized.itemStyle = { ...defaults.itemStyle, ...(normalized.itemStyle || {}) }
  }
  if (defaults.lineStyle) {
    normalized.lineStyle = { ...defaults.lineStyle, ...(normalized.lineStyle || {}) }
  }

  return normalized
}

function getChartAxisDisplayName(chartDef, item) {
  const unit = getChartSeriesUnit(chartDef, item)
  const semantic = getChartSeriesSemantic(chartDef, item)
  if (semantic === 'market') return unit ? `Price (${unit})` : 'Price'
  if (semantic === 'pcs') return unit ? `PCS (${unit})` : 'PCS'
  if (semantic === 'soc') return unit ? `SOC (${unit})` : 'SOC'
  if (semantic === 'load') return unit ? `Load (${unit})` : 'Load'
  if (unit) return unit
  return chartDef?.unit || ''
}

function buildChartOption(chartDef) {
  const validSeries = getChartValidSeries(chartDef)
  const isTimeAxis = getChartAxisType(chartDef) === 'time'
  const isMarketWindow = isMarketWindowChartDefinition(chartDef)
  const isSocPcsTrend = isSocPcsTrendChartDefinition(chartDef)
  const useAxisTooltip = isTimeAxis || validSeries.length > 1
  const unit = chartDef?.unit || ''
  const categoryAxisData = isTimeAxis ? [] : getCategoryAxisData(chartDef, validSeries)
  const timeExtent = isTimeAxis ? getChartTimeExtent(validSeries) : null
  const timeSpan = timeExtent?.span || 0
  const axisKeys = validSeries.map((item, index) => {
    const semantic = getChartSeriesSemantic(chartDef, item)
    const unitName = getChartSeriesUnit(chartDef, item)
    return ((isMarketWindow || isSocPcsTrend) ? semantic : '') || unitName || `series-${index}`
  })
  const uniqueAxisKeys = Array.from(new Set(axisKeys.filter(Boolean)))
  const hasSeriesUnits = validSeries.some(item => !!getChartSeriesUnit(chartDef, item))
  const useMultiYAxis = validSeries.length > 1 && uniqueAxisKeys.length > 1 && (isMarketWindow || isSocPcsTrend || hasSeriesUnits)
  const axisDescriptors = []
  const ensureAxisDescriptor = (item, index, color) => {
    if (!useMultiYAxis) return 0
    const key = axisKeys[index] || `series-${index}`
    const existingIndex = axisDescriptors.findIndex(axis => axis.key === key)
    if (existingIndex >= 0) return existingIndex
    axisDescriptors.push({
      key,
      color,
      name: getChartAxisDisplayName(chartDef, item)
    })
    return axisDescriptors.length - 1
  }
  const seriesUnits = []
  const seriesAxisIndices = []
  const series = validSeries.map((item, index) => {
    const type = item.type || (chartDef?.type === 'bar' ? 'bar' : 'line')
    const color = resolveChartSeriesColor(chartDef, item, index)
    const semantic = getChartSeriesSemantic(chartDef, item)
    const axisIndex = ensureAxisDescriptor(item, index, color)
    seriesAxisIndices[index] = axisIndex
    seriesUnits[index] = getChartSeriesUnit(chartDef, item) || ''
    const data = getChartSeriesData(item, isTimeAxis)
    const shouldShowSymbol = item.showSymbol !== undefined ? item.showSymbol !== false : (type !== 'bar' && !isSocPcsTrend && data.length <= 5)
    const option = {
      name: item.name || '',
      type,
      data,
      yAxisIndex: axisIndex,
      smooth: type !== 'bar' && item.smooth === true ? 0.12 : false,
      showSymbol: item.showSymbol === true ? true : shouldShowSymbol,
      showAllSymbol: false,
      symbolSize: item.symbolSize || 2.5,
      symbol: 'circle',
      lineStyle: {
        width: type === 'bar' ? 0 : (item.lineStyle?.width || 1.5),
        color,
        cap: 'butt',
        join: 'miter',
        type: item.lineStyle?.type || (
          semantic === 'pcs'
            ? 'dashed'
            : (semantic === 'threshold' || /boundary|floor|ceiling|limit/.test(normalizeChartText(item.name)) ? 'dotted' : 'solid')
        ),
        ...(item.lineStyle || {})
      },
      itemStyle: {
        color,
        borderColor: '#ffffff',
        borderWidth: type === 'bar' ? 0 : 1.2,
        ...(item.itemStyle || {})
      },
      emphasis: {
        scale: false,
        lineStyle: { width: type === 'bar' ? 0 : 1.9, color },
        itemStyle: { borderWidth: type === 'bar' ? 0 : 1.6, color }
      }
    }

    const markArea = normalizeChartMarkConfig(item.markArea || (index === 0 ? chartDef?.markArea : null), {
      silent: true,
      label: { show: false },
      itemStyle: {
        color: 'rgba(0, 0, 0, 0.035)',
        borderColor: 'rgba(0, 0, 0, 0.08)',
        borderWidth: 0.5
      }
    })
    if (markArea) {
      option.markArea = markArea
    }

    const markLine = normalizeChartMarkConfig(item.markLine || (index === 0 ? chartDef?.markLine : null), {
      symbol: ['none', 'none'],
      label: { color: '#111111', fontSize: 10.5, fontFamily: CHART_FONT_FAMILY, fontWeight: 400 },
      lineStyle: { color: '#111111', width: 0.9, type: 'dashed' }
    })
    if (markLine) {
      option.markLine = markLine
    }

    const markPoint = normalizeChartMarkConfig(item.markPoint || (index === 0 ? chartDef?.markPoint : null), {
      symbol: 'circle',
      label: { color: '#111111', fontSize: 11, fontFamily: CHART_FONT_FAMILY, fontWeight: 400 },
      itemStyle: { color, borderColor: '#ffffff', borderWidth: 1.5 }
    })
    if (markPoint) {
      option.markPoint = markPoint
    }

    if (type === 'bar') {
      option.barMaxWidth = 28
      option.barMinWidth = 8
      option.itemStyle = {
        borderRadius: [1, 1, 0, 0],
        color
      }
    }

    return option
  })
  const maxSeriesPoints = series.reduce((max, item) => Math.max(max, Array.isArray(item.data) ? item.data.length : 0), 0)
  const hasDataZoom = isTimeAxis && maxSeriesPoints > (isSocPcsTrend ? 60 : 36)
  const hasLegend = series.length > 1
  const unitName = unit ? String(unit).trim() : ''
  const defaultAxisName = validSeries.length === 1
    ? getChartAxisDisplayName(chartDef, validSeries[0])
    : (unitName ? `Value (${unitName})` : '')
  const resolvedAxisDescriptors = useMultiYAxis && axisDescriptors.length
    ? axisDescriptors
    : [{ key: 'default', color: '#6b7883', name: defaultAxisName }]
  const axisValueGroups = resolvedAxisDescriptors.map((_axis, axisIndex) => {
    const values = []
    validSeries.forEach((item, seriesIndex) => {
      const resolvedAxisIndex = useMultiYAxis ? seriesAxisIndices[seriesIndex] : 0
      if (resolvedAxisIndex === axisIndex) {
        values.push(...getChartSeriesNumericValues(item))
      }
    })
    return values
  })
  const axisExtents = axisValueGroups.map(values => resolveChartAxisExtent(values, isMarketWindow || isSocPcsTrend ? 4 : 5))
  const hasLeftAxisName = !!resolvedAxisDescriptors[0]?.name
  const hasRightAxisName = useMultiYAxis && resolvedAxisDescriptors.length > 1 && !!resolvedAxisDescriptors[1]?.name
  const gridLeft = useMultiYAxis ? 10 : 8
  const gridRight = useMultiYAxis
    ? Math.min(28, (hasRightAxisName ? 14 : 10) + Math.max(0, resolvedAxisDescriptors.length - 2) * 6)
    : 10
  const gridTop = hasLegend ? 34 : (hasLeftAxisName || hasRightAxisName ? 24 : 14)
  const gridBottom = isTimeAxis ? 24 : 20
  const yAxis = resolvedAxisDescriptors.map((axis, index) => {
    const isLeft = index === 0
    const axisExtent = axisExtents[index] || {}
    return {
      type: 'value',
      name: axis.name,
      nameLocation: 'end',
      nameRotate: 0,
      nameGap: 8,
      min: axisExtent.min,
      max: axisExtent.max,
      scale: true,
      position: isLeft ? 'left' : 'right',
      offset: !isLeft && index > 1 ? (index - 1) * 30 : 0,
      nameTextStyle: {
        fontFamily: CHART_FONT_FAMILY,
        fontSize: 10.5,
        color: '#111111',
        fontWeight: 400,
        align: isLeft ? 'left' : 'right',
        verticalAlign: 'bottom',
        padding: [0, 0, 3, 0]
      },
      axisLabel: {
        margin: 3,
        fontFamily: CHART_FONT_FAMILY,
        fontSize: 10.5,
        color: '#111111',
        formatter: formatChartAxisValue,
        hideOverlap: true
      },
      splitNumber: isMarketWindow || isSocPcsTrend ? 4 : 5,
      splitLine: index === 0
        ? { lineStyle: { color: '#e6e6e6', type: 'dashed', width: 0.8 } }
        : { show: false },
      axisLine: { show: true, lineStyle: { color: '#111111', width: 1 } },
      axisTick: { show: true, lineStyle: { color: '#111111', width: 1 }, length: 4 }
    }
  })

  const option = {
    color: CHART_COLORS,
    backgroundColor: 'transparent',
    textStyle: {
      fontFamily: CHART_FONT_FAMILY
    },
    animationDuration: 220,
    animationEasing: 'cubicOut',
    tooltip: {
      trigger: useAxisTooltip ? 'axis' : 'item',
      confine: true,
      backgroundColor: '#ffffff',
      borderColor: '#b8b8b8',
      borderWidth: 1,
      textStyle: { color: '#111111', fontSize: 11.5, fontFamily: CHART_FONT_FAMILY },
      axisPointer: useAxisTooltip
        ? {
            type: 'line',
            snap: isTimeAxis,
            lineStyle: { color: '#8c8c8c', width: 0.9, type: 'dashed' }
          }
        : undefined,
      formatter: params => {
        const items = Array.isArray(params) ? params : [params]
        if (!items.length) return ''
        const title = isTimeAxis
          ? formatChartTooltipTimeLabel(items[0]?.axisValue ?? items[0]?.value?.[0] ?? items[0]?.name, timeSpan)
          : (items[0]?.axisValueLabel || items[0]?.name || '')
        const lines = []
        if (title) {
          lines.push(`<div style="margin-bottom:6px;color:#111111;font-weight:600">${escapeChartText(title)}</div>`)
        }
        items.forEach(item => {
          const value = Array.isArray(item.value) ? item.value[item.value.length - 1] : item.value
          const itemUnit = seriesUnits[item.seriesIndex] || unitName
          lines.push(
            `<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;min-width:156px;margin-top:2px;">` +
              `<span style="display:inline-flex;align-items:center;gap:6px;color:#333333;">${item.marker || ''}${escapeChartText(item.seriesName || 'Value')}</span>` +
              `<strong style="color:#111111;font-weight:600;">${escapeChartText(formatChartTooltipValue(value, itemUnit))}</strong>` +
            `</div>`
          )
        })
        return `<div style="min-width:156px;">${lines.join('')}</div>`
      },
      extraCssText: 'border-radius:2px;padding:7px 9px;box-shadow:none'
    },
    legend: hasLegend ? {
      top: 0,
      left: 'center',
      itemWidth: 24,
      itemHeight: 2,
      icon: 'roundRect',
      itemGap: 16,
      selectedMode: true,
      inactiveColor: '#b8b8b8',
      textStyle: { fontFamily: CHART_FONT_FAMILY, fontSize: 11, color: '#111111', fontWeight: 400 }
    } : undefined,
    grid: {
      left: gridLeft,
      right: gridRight,
      top: gridTop,
      bottom: gridBottom,
      containLabel: true
    },
    xAxis: {
      type: isTimeAxis ? 'time' : 'category',
      data: isTimeAxis ? undefined : categoryAxisData,
      boundaryGap: isTimeAxis ? false : undefined,
      name: isTimeAxis ? 'Time' : '',
      nameLocation: 'middle',
      nameGap: 14,
      nameTextStyle: { color: '#111111', fontFamily: CHART_FONT_FAMILY, fontSize: 10.5, fontWeight: 400 },
      splitNumber: isSocPcsTrend ? 5 : undefined,
      axisLabel: {
        margin: 4,
        fontFamily: CHART_FONT_FAMILY,
        fontSize: 10.5,
        color: '#111111',
        hideOverlap: true,
        showMinLabel: true,
        showMaxLabel: true,
        alignMinLabel: 'left',
        alignMaxLabel: 'right',
        formatter: isTimeAxis ? value => formatChartTimeAxisLabel(value, timeSpan) : value => {
          const text = String(value)
          return text.length > 14 ? `${text.slice(0, 12)}...` : text
        }
      },
      axisLine: { onZero: false, lineStyle: { color: '#111111', width: 1 } },
      axisTick: { show: true, lineStyle: { color: '#111111', width: 1 }, length: 4 }
    },
    yAxis: yAxis.length === 1 ? yAxis[0] : yAxis,
    series
  }

  if (hasDataZoom) {
    option.dataZoom = [
      { type: 'inside', start: 0, end: 100, zoomOnMouseWheel: true, moveOnMouseMove: true }
    ]
  }

  return option
}

function chartExportWidth(width, maxWidth = REPORT_CHART_EXPORT_WIDTH) {
  const value = Number(width)
  if (!Number.isFinite(value) || value <= 0) return maxWidth
  return Math.min(Math.max(Math.round(value), REPORT_CHART_EXPORT_MIN_WIDTH), maxWidth)
}

async function captureChartDefinitionDataUrl(chartDef, maxWidth = REPORT_CHART_EXPORT_WIDTH) {
  const width = chartExportWidth(chartDef?.exportWidth || chartDef?.export_width || maxWidth, maxWidth)
  const height = getChartHeight(chartDef)
  const node = document.createElement('div')
  node.style.cssText = [
    'position: fixed',
    'left: -10000px',
    'top: 0',
    `width: ${width}px`,
    `height: ${height}px`,
    'background: #ffffff',
    'pointer-events: none',
    'visibility: hidden'
  ].join(';')
  document.body.appendChild(node)

  let chart = null
  try {
    chart = echarts.init(node, null, { renderer: 'canvas', width, height })
    chart.setOption(buildChartOption(chartDef), true)
    chart.resize({ width, height })
    await nextAnimationFrame()
    return chart.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: '#ffffff'
    })
  } finally {
    if (chart && !chart.isDisposed()) {
      chart.dispose()
    }
    if (node.parentNode) {
      node.parentNode.removeChild(node)
    }
  }
}

function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function trimText(text, maxLength) {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`
}

function normalizeHistoryPreviewText(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function sanitizeHistoryMessage(message) {
  const displayContent = String(message.content || '')
  const parsedReport = extractReportBlock(displayContent)
  return {
    id: message.id || createMessageId(),
    role: message.role === 'user' ? 'user' : 'agent',
    content: displayContent,
    reportContent: String(message.reportContent || parsedReport.reportContent || ''),
    reportFiles: Array.isArray(message.reportFiles) ? message.reportFiles : structuredReportFiles(message.response),
    response: message.response || null,
    attachments: Array.isArray(message.attachments)
      ? message.attachments.map(item => ({ name: String(item.name || ''), type: String(item.type || '') })).filter(item => item.name)
      : [],
    timestamp: message.timestamp || Date.now(),
    isError: !!message.isError
  }
}

function sanitizeHistoryItem(item) {
  const messages = Array.isArray(item?.messages)
    ? item.messages.map(sanitizeHistoryMessage).slice(-HISTORY_MAX_MESSAGES)
    : []
  const now = Date.now()
  const id = String(item?.id || item?.conversationId || createMessageId())
  return {
    id,
    conversationId: item?.conversationId || null,
    title: trimText(normalizeHistoryPreviewText(item?.title) || deriveHistoryTitle(messages), HISTORY_TITLE_LENGTH) || 'Untitled conversation',
    updatedAt: Number(item?.updatedAt) || now,
    createdAt: Number(item?.createdAt) || Number(item?.updatedAt) || now,
    agentMode: item?.agentMode === 'thinking' ? 'thinking' : 'simple',
    selectedSiteIds: Array.isArray(item?.selectedSiteIds) ? item.selectedSiteIds : [],
    timeStart: String(item?.timeStart || ''),
    timeEnd: String(item?.timeEnd || ''),
    messages
  }
}

function sanitizeSiteIds(siteIds) {
  return Array.isArray(siteIds)
    ? siteIds
      .map(id => String(id || '').trim())
      .filter(Boolean)
    : []
}

function deriveHistoryTitle(messages) {
  const firstUserMessage = messages.find(item => item.role === 'user' && item.content)
  return trimText(normalizeHistoryPreviewText(firstUserMessage?.content) || 'New conversation', HISTORY_TITLE_LENGTH)
}

function getHistoryMessagePreviewContent(message) {
  if (!message) return ''
  if (message.role === 'agent') {
    if (getStructuredReport(message.response)) {
      return normalizeHistoryPreviewText(structuredReportSummary(message.response, message.content))
    }
    return normalizeHistoryPreviewText(extractReportBlock(message.content).chatContent)
  }
  return normalizeHistoryPreviewText(message.content)
}

function historyStorageKey(userId) {
  const identity = String(userId || 'anonymous').trim() || 'anonymous'
  return `${HISTORY_STORAGE_KEY}:${identity}`
}

function loadConversationHistory(userId) {
  try {
    const raw = localStorage.getItem(historyStorageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(sanitizeHistoryItem)
      .filter(item => item.messages.length)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, HISTORY_MAX_ITEMS)
  } catch (error) {
    return []
  }
}

function saveConversationHistory(items, userId) {
  const normalizedItems = (Array.isArray(items) ? items : [])
    .map(sanitizeHistoryItem)
    .filter(item => item.messages.length)
    .sort((a, b) => b.updatedAt - a.updatedAt)

  const normalized = []
  normalizedItems.forEach(item => {
    const duplicateIndex = normalized.findIndex(existing =>
      existing.id === item.id ||
      (!!item.conversationId && existing.conversationId === item.conversationId)
    )
    if (duplicateIndex >= 0) {
      const existing = normalized[duplicateIndex]
      normalized[duplicateIndex] = item.updatedAt >= existing.updatedAt ? item : existing
    } else {
      normalized.push(item)
    }
  })

  const limited = normalized
    .slice(0, HISTORY_MAX_ITEMS)
  localStorage.setItem(historyStorageKey(userId), JSON.stringify(limited))
  return limited
}

const INTERFACE_TEXT_TRANSLATIONS = [
  [/^准备执行$/, 'Preparing request'],
  [/^理解问题$/, 'Understanding request'],
  [/^执行中$/, 'Running'],
  [/^正在处理$/, 'Processing'],
  [/^已生成回答$/, 'Answer generated'],
  [/^准备调用工具$/, 'Preparing tool calls'],
  [/^选择合适工具$/, 'Selecting suitable tools'],
  [/^工具执行完成$/, 'Tool completed'],
  [/^工具返回异常$/, 'Tool returned an issue'],
  [/^已生成图表$/, 'Chart generated'],
  [/^图表数据已返回$/, 'Chart data returned'],
  [/^生成图表$/, 'Generate chart'],
  [/^请求失败$/, 'Request failed'],
  [/^处理失败$/, 'Processing failed'],
  [/^已处理。?$/, 'Processed.'],
  [/^(\d+)\s*个步骤$/, match => `${match[1]} step${match[1] === '1' ? '' : 's'}`],
  [/^调用\s*(.+)$/, match => `Calling ${normalizeInterfaceText(match[1], 'tool')}`],
  [/^模型[:：]\s*(.+)$/, match => `Model: ${match[1]}`]
]

function normalizeInterfaceText(text, fallback = '') {
  if (text == null) return fallback
  const value = String(text).trim()
  if (!value) return fallback
  for (const [pattern, replacement] of INTERFACE_TEXT_TRANSLATIONS) {
    const match = value.match(pattern)
    if (match) {
      return typeof replacement === 'function' ? replacement(match) : replacement
    }
  }
  return value
}

export default {
  name: 'AssistantDialog',
  components: {
    AgentLoadingIndicator
  },
  props: {
    visible: {
      type: Boolean,
      default: false
    },
    bubbleX: {
      type: Number,
      default: null
    },
    bubbleY: {
      type: Number,
      default: null
    }
  },
  data() {
    return {
      attachmentAccept: ATTACHMENT_ACCEPT,
      phase: 'welcome',
      presetQuestions: [...DEFAULT_PRESETS],
      selectedPresetIndex: null,
      questionText: '',
      attachments: [],
      attachmentStatus: 'idle',
      attachmentError: '',
      isFullscreen: false,
      drawerWidthBeforeFullscreen: null,
      drawerWidth: loadDrawerWidth(),
      isDrawerResizing: false,
      dialogTop: 0,
      layoutViewportWidth: null,
      layoutViewportHeight: null,
      health: null,
      ragHealth: null,
      tools: [],
      toolSearch: '',
      systemPanelOpen: false,
      contextPanelOpen: false,
      sites: [],
      sitesLoading: false,
      sitesLoadError: '',
      selectedSiteIds: [],
      currentPageContext: null,
      siteScopeSource: SITE_SCOPE_SOURCES.NONE,
      agentMode: 'simple',
      timeStart: '',
      timeEnd: '',
      agentModeMenuOpen: false,
      agentModeMenuPosition: {
        left: 0,
        top: 0
      },
      conversationId: null,
      activeHistoryId: null,
      conversationHistory: [],
      historyPanelOpen: false,
      messages: [],
      expandedEvidenceIds: {},
      collapsedChartIds: {},
      initializedChartCollapseIds: {},
      isInitializing: false,
      isStreaming: false,
      streamActivityTitle: 'Agent is processing',
      streamActivityDetail: '',
      streamActivitySteps: [],
      streamPhase: 'idle',
      streamActivities: [],
      streamStartedAt: null,
      streamElapsedSeconds: 0,
      streamElapsedTimer: null,
      streamProgressExpanded: false,
      streamingOutput: '',
      streamingCharts: [],
      streamAbortController: null,
      stopRequested: false,
      suppressStopMessage: false
    }
  },
  computed: {
    dialogStyle() {
      if (this.isFullscreen) {
        return {
          top: '0px',
          width: '100%'
        }
      }
      const width = this.getDialogWidth()
      return {
        top: `${this.dialogTop}px`,
        width: `${width}px`
      }
    },
    hasAttachment() {
      return this.attachments.length > 0
    },
    hasUploadingAttachment() {
      return this.attachments.some(item => item.status === 'uploading')
    },
    readyAttachmentIds() {
      return this.attachments
        .filter(item => item.status === 'ready' && item.attachmentId)
        .map(item => item.attachmentId)
    },
    canSend() {
      return !this.isStreaming
        && !this.isInitializing
        && !this.hasUploadingAttachment
        && this.questionText.trim().length > 0
    },
    showSendActive() {
      return this.canSend || this.isStreaming
    },
    inputPlaceholder() {
      if (this.isStreaming) return ''
      if (this.phase === 'chat') return 'Ask Enerlution EMS3.0 Agent a follow-up'
      return 'Ask Enerlution EMS3.0 Agent about your sites'
    },
    agentModeLabel() {
      return AGENT_MODE_LABELS[this.agentMode] || AGENT_MODE_LABELS.simple
    },
    agentModeOptions() {
      return [
        {
          value: 'simple',
          label: AGENT_MODE_LABELS.simple,
          description: 'Fast text analysis'
        },
        {
          value: 'thinking',
          label: AGENT_MODE_LABELS.thinking,
          description: 'Supports attachments'
        }
      ]
    },
    canUseAttachments() {
      return this.agentMode === 'thinking'
    },
    agentModeMenuStyle() {
      return {
        left: `${this.agentModeMenuPosition.left}px`,
        top: `${this.agentModeMenuPosition.top}px`
      }
    },
    modelLabel() {
      return this.health?.model || 'Agent'
    },
    currentUserId() {
      return storageIdentity()
    },
    currentUserContext() {
      const selectedSites = this.selectedSiteIds.map(siteId => {
        const site = this.siteOptions.find(option => option.id === String(siteId))
        return {
          site_id: String(siteId),
          site_name: site?.label || String(siteId)
        }
      })
      const currentSite = selectedSites.length === 1 ? selectedSites[0] : null
      return {
        user_id: context.user?.id || null,
        tenant_id: context.user?.tenantId || null,
        timezone: context.timezone,
        user_name: this.$store?.getters?.name || '',
        roles: this.$store?.getters?.roles || [],
        permissions: this.$store?.getters?.permissions || [],
        locale: this.$store?.getters?.language || 'en',
        selected_sites: selectedSites,
        ...(this.currentPageContext ? { page_context: this.currentPageContext } : {}),
        ...(currentSite ? { site_id: currentSite.site_id, site_name: currentSite.site_name } : {})
      }
    },
    siteOptions() {
      return this.sites
        .map(site => ({
          id: String(resolveSiteId(site) || ''),
          label: resolveSiteLabel(site)
        }))
        .filter(site => site.id)
    },
    siteSelectEmptyText() {
      if (this.sitesLoading) return 'Loading sites'
      if (this.sitesLoadError) return 'Could not load sites'
      return 'No accessible sites'
    },
    selectedSiteSummary() {
      if (!this.selectedSiteIds.length) return 'All sites'
      const labels = this.selectedSiteIds.map(id => {
        return this.siteOptions.find(site => site.id === id)?.label || id
      })
      if (labels.length === 1) return labels[0]
      return `${labels.length} sites`
    },
    timeRangeSummary() {
      if (!this.timeStart && !this.timeEnd) return 'Natural language time'
      if (this.timeStart && this.timeEnd) return 'Custom range'
      return this.timeStart ? 'From selected time' : 'Until selected time'
    },
    timeRangePresets() {
      return TIME_RANGE_PRESETS
    },
    filteredTools() {
      const query = this.toolSearch.trim().toLowerCase()
      if (!query) return this.tools
      return this.tools.filter(tool => {
        const name = String(tool.name || tool.tool_name || tool.function?.name || '')
        const description = String(tool.description || tool.function?.description || '')
        return `${name} ${description}`.toLowerCase().includes(query)
      })
    },
    agentReady() {
      return this.health?.status === 'ok'
    },
    ragReady() {
      return this.ragHealth?.ready === true || this.ragHealth?.graphrag === 'ready'
    },
    attachmentStatusText() {
      if (this.agentMode !== 'thinking') return 'Attachments are available in Thinking mode only'
      if (this.hasUploadingAttachment) return 'Uploading attachments'
      if (this.attachments.some(item => item.status === 'error')) return 'Attachment issue'
      if (this.readyAttachmentIds.length) return `${this.readyAttachmentIds.length} attachments ready`
      if (this.attachmentStatus === 'error') return 'Attachment issue'
      return 'No attachments'
    },
    attachmentDetailText() {
      if (this.attachmentStatus === 'error') return this.attachmentError
      if (this.agentMode !== 'thinking') return 'Switch to Thinking to upload images, PDF, Word, Excel, or text files'
      return 'Supports multiple files up to 20MB each'
    },
    attachmentStatusClass() {
      return {
        'is-disabled': this.agentMode !== 'thinking',
        'is-ready': this.attachmentStatus === 'ready',
        'is-uploading': this.attachmentStatus === 'uploading',
        'is-error': this.attachmentStatus === 'error'
      }
    },
    drawerMinWidth() {
      return Math.min(DIALOG_MIN_WIDTH, this.drawerMaxWidth)
    },
    drawerMaxWidth() {
      const width = this.layoutViewportWidth || this.getLayoutViewportSize().width
      return Math.max(320, Math.min(DIALOG_MAX_WIDTH, width - 12))
    },
    drawerWidthValue() {
      return this.getDialogWidth()
    },
    isCompactDrawer() {
      return !this.isFullscreen && this.drawerWidthValue <= 440
    },
    isRoomyDrawer() {
      return !this.isFullscreen && this.drawerWidthValue >= 560
    },
    canResizeDrawer() {
      const width = this.layoutViewportWidth || this.getLayoutViewportSize().width
      return !this.isFullscreen && width > 720
    }
  },
  watch: {
    drawerWidthValue() { sendHost('layout', {width:this.drawerWidthValue,fullscreen:this.isFullscreen}) },
    isFullscreen() { sendHost('layout', {width:this.drawerWidthValue,fullscreen:this.isFullscreen}) },
    visible(val) {
      if (val) {
        this.$nextTick(() => {
          this.updatePosition()
          sendHost('layout', {width:this.drawerWidthValue,fullscreen:this.isFullscreen})
          this.initAgent()
          this.renderChartsInDialog()
          this.scrollChatToBottom()
          this.$refs.questionInput && this.$refs.questionInput.focus()
        })
      } else {
        this.handleDialogHidden()
      }
    },
    bubbleX() {
      if (this.visible) {
        this.$nextTick(() => this.updatePosition())
      }
    },
    bubbleY() {
      if (this.visible) {
        this.$nextTick(() => this.updatePosition())
      }
    },
    messages: {
      handler() {
        this.ensureAllMessageChartsDefaultCollapsed({ render: false })
        this.$nextTick(() => {
          this.renderChartsInDialog()
          this.scrollChatToBottom()
        })
      },
      deep: true
    },
    streamingOutput() {
      this.$nextTick(() => {
        this.renderChartsInDialog()
        this.scrollChatToBottom()
      })
    },
    streamingCharts: {
      handler() {
        this.ensureChartsDefaultCollapsed('streaming', this.streamingCharts, { render: false })
        this.$nextTick(() => {
          this.renderChartsInDialog()
          this.scrollChatToBottom()
        })
      },
      deep: true
    }
  },
    mounted() {
      if (this.visible) this.$nextTick(() => {this.updatePosition();this.initAgent();sendHost('layout',{width:this.drawerWidthValue,fullscreen:this.isFullscreen})})
      this.chartInstances = Object.create(null)
      this.chartResizeHandler = () => this.resizeCharts()
      window.addEventListener('resize', this.updatePosition)
      window.addEventListener('resize', this.chartResizeHandler)
      window.addEventListener('pointermove', this.handleDrawerResizeMove)
      window.addEventListener('pointerup', this.stopDrawerResize)
      window.addEventListener('pointercancel', this.stopDrawerResize)
      document.addEventListener('keydown', this.onKeydown)
      document.addEventListener('click', this.onDocumentClick)
    },
  beforeDestroy() {
    window.removeEventListener('resize', this.updatePosition)
    if (this.chartResizeHandler) {
      window.removeEventListener('resize', this.chartResizeHandler)
      }
      window.removeEventListener('pointermove', this.handleDrawerResizeMove)
      window.removeEventListener('pointerup', this.stopDrawerResize)
      window.removeEventListener('pointercancel', this.stopDrawerResize)
      document.removeEventListener('keydown', this.onKeydown)
      document.removeEventListener('click', this.onDocumentClick)
      if (this.streamElapsedTimer) clearInterval(this.streamElapsedTimer)
      this.stopGeneration({ silent: true, suppressMessage: true })
      this.disposeCharts()
      this.revokeAttachmentPreviews()
  },
  methods: {
    assetUrl,
    invalidateAccessScope() {
      this.stopGeneration({silent:true,suppressMessage:true})
      this.messages=[];this.conversationHistory=[];this.conversationId=null;this.activeHistoryId=null
      localStorage.removeItem(historyStorageKey(this.currentUserId));saveConversationId(null,this.currentUserId)
      this.revokeAttachmentPreviews();this.attachments=[];this.attachmentStatus='idle';this.attachmentError=''
      this.isStreaming=false;this.resetStreamState();this.disposeCharts();this.phase='welcome'
    },
    async buildCurrentUserContext() {
      const context = { ...this.currentUserContext }
      delete context.page_context
      try {
        const pageContext = await collectAgentPageContext({ route: this.$route })
        this.currentPageContext = pageContext && pageContext.pages && pageContext.pages.length
          ? pageContext
          : null
        if (this.currentPageContext) {
          context.page_context = this.currentPageContext
        }
      } catch (error) {
        this.currentPageContext = {
          active_page_id: null,
          route: {
            path: this.$route?.path || '',
            name: this.$route?.name || '',
            fullPath: this.$route?.fullPath || '',
            query: this.$route?.query || {}
          },
          status: 'context_error',
          error: error?.message || String(error),
          pages: []
        }
        context.page_context = this.currentPageContext
      }
      return context
    },
    getLayoutViewportSize() {
      const scale = getPageZoom()
      return {
        width: (context.viewportWidth || window.innerWidth) / scale,
        height: window.innerHeight / scale
      }
    },
    updatePosition() {
      const { width, height } = this.getLayoutViewportSize()
      this.layoutViewportWidth = width
      this.layoutViewportHeight = height

      if (this.bubbleY != null) {
        this.dialogTop = this.bubbleY + (BUBBLE_SIZE - DIALOG_HEIGHT) / 2
      } else {
        this.dialogTop = (height - DIALOG_HEIGHT) / 2
      }

      const maxTop = Math.max(0, height - DIALOG_HEIGHT)
      this.dialogTop = Math.min(Math.max(0, this.dialogTop), maxTop)
      const clampedWidth = this.clampDrawerWidth(this.drawerWidth || DIALOG_WIDTH)
      if (clampedWidth !== this.drawerWidth) {
        this.drawerWidth = clampedWidth
      }
      if (this.agentModeMenuOpen) {
        this.$nextTick(() => this.updateAgentModeMenuPosition())
      }
    },
    getDialogWidth() {
      return this.clampDrawerWidth(this.drawerWidth || DIALOG_WIDTH)
    },
    toggleFullscreen() {
      if (this.isFullscreen) {
        this.isFullscreen = false
        if (this.drawerWidthBeforeFullscreen) {
          this.drawerWidth = this.clampDrawerWidth(this.drawerWidthBeforeFullscreen)
        }
        this.drawerWidthBeforeFullscreen = null
      } else {
        this.drawerWidthBeforeFullscreen = this.drawerWidthValue
        this.isFullscreen = true
        this.isDrawerResizing = false
        document.body.classList.remove('assistant-dialog-resizing')
      }
      this.agentModeMenuOpen = false
      this.$nextTick(() => {
        this.updatePosition()
        this.updateAgentModeMenuPosition()
        this.resizeCharts()
      })
    },
    clampDrawerWidth(width) {
      return Math.max(this.drawerMinWidth, Math.min(Number(width) || DIALOG_WIDTH, this.drawerMaxWidth))
    },
    setDrawerWidth(width, { persist = false } = {}) {
      const nextWidth = this.clampDrawerWidth(width)
      this.drawerWidth = nextWidth
      if (persist) {
        saveDrawerWidth(nextWidth)
      }
      this.$nextTick(() => {
        this.updateAgentModeMenuPosition()
        this.resizeCharts()
      })
    },
    startDrawerResize(event) {
      if (!this.canResizeDrawer || !event || event.button > 0) return
      this.isDrawerResizing = true
      this.agentModeMenuOpen = false
      document.body.classList.add('assistant-dialog-resizing')
      if (event.currentTarget && event.currentTarget.setPointerCapture) {
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch (error) {
          // Synthetic pointer events in tests may not be capturable.
        }
      }
      this.setDrawerWidthFromPointer(event, { persist: false })
    },
    handleDrawerResizeMove(event) {
      if (!this.isDrawerResizing) return
      event.preventDefault()
      this.setDrawerWidthFromPointer(event, { persist: false })
    },
    stopDrawerResize() {
      if (!this.isDrawerResizing) return
      this.isDrawerResizing = false
      document.body.classList.remove('assistant-dialog-resizing')
      saveDrawerWidth(this.drawerWidthValue)
      this.$nextTick(() => this.resizeCharts())
    },
    setDrawerWidthFromPointer(event, options) {
      const scale = getPageZoom()
      const viewportWidth = (context.viewportWidth || window.innerWidth || document.documentElement.clientWidth) / scale
      const pointerX = (event.clientX + viewportWidth - window.innerWidth) / scale
      this.setDrawerWidth(viewportWidth - pointerX, options)
    },
    handleDrawerResizeKeydown(event) {
      const keySteps = {
        ArrowLeft: 24,
        ArrowRight: -24,
        Home: this.drawerMinWidth - this.drawerWidthValue,
        End: this.drawerMaxWidth - this.drawerWidthValue
      }
      if (!Object.prototype.hasOwnProperty.call(keySteps, event.key)) return
      event.preventDefault()
      this.setDrawerWidth(this.drawerWidthValue + keySteps[event.key], { persist: true })
    },
    async initAgent() {
      if (this.isInitializing) return
      this.isInitializing = true
      this.conversationHistory = loadConversationHistory(this.currentUserId)
      this.conversationId = loadConversationId(this.currentUserId)
      this.activeHistoryId = this.conversationId
      this.agentMode = loadAgentMode(this.currentUserId)
      const savedRange = loadTimeRange(this.currentUserId)
      this.timeStart = savedRange?.startLocal || ''
      this.timeEnd = savedRange?.endLocal || ''
      this.selectedSiteIds = sanitizeSiteIds(loadSelectedSiteIds(this.currentUserId))
      this.siteScopeSource = this.selectedSiteIds.length ? SITE_SCOPE_SOURCES.USER : SITE_SCOPE_SOURCES.NONE
      this.restoreActiveHistoryConversation()
      this.applyRouteSiteContext()

      try {
        const [health, ragHealth, tools, sites] = await Promise.all([
          getHealth().catch(() => null),
          getRagHealth().catch(() => null),
          getTools().catch(() => []),
          this.fetchSites().catch(() => [])
        ])
        this.health = health
        this.ragHealth = ragHealth
        this.tools = Array.isArray(tools) ? tools : (tools?.items || tools?.tools || [])
        this.updatePresetQuestions()
      } catch (error) {
        this.$message.warning(this.formatError(error))
      } finally {
        this.isInitializing = false
      }
    },
    async fetchSites() {
      this.sitesLoading = true
      this.sitesLoadError = ''
      try {
        const sites = await getSites()
        this.sites = Array.isArray(sites) ? sites : []
        this.reconcileSelectedSites()
        return this.sites
      } catch (error) {
        this.sites = []
        this.sitesLoadError = this.formatError(error) || 'Could not load sites'
        throw error
      } finally {
        this.sitesLoading = false
      }
    },
    streamProgressTitle() {
      if (this.streamPhase === 'stopping') return 'Stopping generation'
      if (this.streamPhase === 'completed') return 'Answer ready'
      return this.streamActivityTitle || 'Working on your request'
    },
    streamElapsedLabel() {
      if (this.streamElapsedSeconds < 1) return 'Now'
      return `${this.streamElapsedSeconds}s`
    },
    streamLongWaitText() {
      if (this.streamElapsedSeconds < 20 || this.streamingOutput) return ''
      return 'Still working — this step is taking longer than usual.'
    },
    streamCompletedCount() {
      return this.streamActivities.filter(activity => activity.status === 'completed').length
    },
    async refreshSites() {
      try {
        await this.fetchSites()
        this.updatePresetQuestions()
        this.$message.success('Site list refreshed')
      } catch (error) {
        this.$message.error(this.formatError(error))
      }
    },
    reconcileSelectedSites() {
      const validIds = new Set(this.siteOptions.map(site => site.id))
      const nextIds = this.selectedSiteIds.filter(id => validIds.has(String(id)))
      if (nextIds.length === this.selectedSiteIds.length) return
      this.selectedSiteIds = nextIds
      this.siteScopeSource = nextIds.length ? this.siteScopeSource : SITE_SCOPE_SOURCES.NONE
      saveSelectedSiteIds(nextIds, this.currentUserId)
    },
    getRouteSiteIds() {
      const query = this.$route?.query || {}
      const params = this.$route?.params || {}
      return sanitizeSiteIds([
        query.stationId,
        query.siteId,
        query.siteCode,
        params.stationId,
        params.siteId,
        params.siteCode
      ])
    },
    applyRouteSiteContext() {
      if (this.messages.length || this.selectedSiteIds.length) return
      const routeSiteIds = this.getRouteSiteIds()
      if (!routeSiteIds.length) return
      this.selectedSiteIds = routeSiteIds
      this.siteScopeSource = SITE_SCOPE_SOURCES.ROUTE
      saveSelectedSiteIds(this.selectedSiteIds, this.currentUserId)
    },
    hasExplicitSiteContext() {
      return this.selectedSiteIds.length > 0 &&
        [
          SITE_SCOPE_SOURCES.USER,
          SITE_SCOPE_SOURCES.HISTORY,
          SITE_SCOPE_SOURCES.ROUTE,
          SITE_SCOPE_SOURCES.AGENT
        ].includes(this.siteScopeSource)
    },
    getOutboundSiteScope(message = '') {
      if (isGlobalSiteQuestion(message)) return []
      const mappedSiteIds = resolveMappedSiteIdsFromQuestion(message, this.sites)
      const explicitSiteIds = this.hasExplicitSiteContext() ? [...this.selectedSiteIds] : []
      return mappedSiteIds.length
        ? mergeSiteScopes(mappedSiteIds, explicitSiteIds)
        : explicitSiteIds
    },
    applyMappedSiteContext(message = '') {
      const mappedSiteIds = resolveMappedSiteIdsFromQuestion(message, this.sites)
      if (!mappedSiteIds.length) return []
      this.selectedSiteIds = mappedSiteIds
      this.siteScopeSource = SITE_SCOPE_SOURCES.USER
      saveSelectedSiteIds(this.selectedSiteIds, this.currentUserId)
      return mappedSiteIds
    },
    restoreActiveHistoryConversation() {
      if (this.messages.length || !this.conversationHistory.length) return false
      const conversation = this.conversationHistory.find(item =>
        item.id === this.activeHistoryId ||
        (!!this.conversationId && item.conversationId === this.conversationId)
      )
      if (!conversation) return false

      const restored = sanitizeHistoryItem(conversation)
      this.conversationId = restored.conversationId
      this.activeHistoryId = restored.id
      if (restored.conversationId) {
        saveConversationId(restored.conversationId, this.currentUserId)
      }
      this.agentMode = restored.agentMode || this.agentMode
      saveAgentMode(this.agentMode, this.currentUserId)
      this.selectedSiteIds = sanitizeSiteIds(restored.selectedSiteIds)
      this.siteScopeSource = this.selectedSiteIds.length ? SITE_SCOPE_SOURCES.HISTORY : SITE_SCOPE_SOURCES.NONE
      saveSelectedSiteIds(this.selectedSiteIds, this.currentUserId)
      this.timeStart = restored.timeStart || ''
      this.timeEnd = restored.timeEnd || ''
      this.handleContextSettingsChange()
      this.messages = restored.messages.map(sanitizeHistoryMessage)
      this.expandedEvidenceIds = {}
      this.collapsedChartIds = {}
      this.initializedChartCollapseIds = {}
      this.ensureAllMessageChartsDefaultCollapsed({ render: false })
      this.phase = 'chat'
      this.$nextTick(() => {
        this.renderChartsInDialog()
        this.scrollChatToBottom()
      })
      return true
    },
    updatePresetQuestions() {
      this.presetQuestions = [...DEFAULT_PRESETS]
    },
    toggleSystemPanel() {
      this.systemPanelOpen = !this.systemPanelOpen
      if (this.systemPanelOpen) {
        this.historyPanelOpen = false
        this.agentModeMenuOpen = false
      }
    },
    toolDisplayName(tool) {
      return tool?.name || tool?.tool_name || tool?.function?.name || 'tool'
    },
    toolDescription(tool) {
      return tool?.description || tool?.function?.description || ''
    },
    handleSiteScopeChange(value) {
      this.selectedSiteIds = sanitizeSiteIds(value)
      this.siteScopeSource = this.selectedSiteIds.length ? SITE_SCOPE_SOURCES.USER : SITE_SCOPE_SOURCES.NONE
      saveSelectedSiteIds(this.selectedSiteIds, this.currentUserId)
    },
    handleContextSettingsChange() {
      saveTimeRange({
        startLocal: this.timeStart || '',
        endLocal: this.timeEnd || ''
      }, this.currentUserId)
    },
    applyTimeRangePreset(preset) {
      const range=presetTimeRange(preset)
      if(!range)return
      this.timeStart=range.start;this.timeEnd=range.end
      this.handleContextSettingsChange()
    },
    formatDateTimeLocal(date) { return wallClock(date) },
    buildTimeRange() {
      const start=this.localDateTimeToIso(this.timeStart),end=this.localDateTimeToIso(this.timeEnd)
      return start||end?{start,end}:null
    },
    isTimeRangeValid() {
      const start=this.localDateTimeToIso(this.timeStart),end=this.localDateTimeToIso(this.timeEnd)
      if((this.timeStart&&!start)||(this.timeEnd&&!end))return false
      return !start||!end||Date.parse(start)<=Date.parse(end)
    },
    localDateTimeToIso(value) { return wallClockToIso(value) },
    toggleAgentModeMenu() {
      if (this.isStreaming) return
      this.agentModeMenuOpen = !this.agentModeMenuOpen
      if (this.agentModeMenuOpen) {
        this.$nextTick(() => this.updateAgentModeMenuPosition())
      }
    },
    updateAgentModeMenuPosition() {
      if (!this.agentModeMenuOpen) return
      const trigger = this.$refs.agentModeSelect
      if (!trigger || !trigger.getBoundingClientRect) return
      const rect = trigger.getBoundingClientRect()
      const menuHeight = 116
      const menu = this.$refs.agentModeMenuOptions
      const measuredMenuWidth = menu && menu.getBoundingClientRect
        ? menu.getBoundingClientRect().width
        : 0
      const menuWidth = Math.max(184, Math.round(measuredMenuWidth || 184))
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || menuWidth
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || menuHeight
      let left = rect.left
      let top = rect.top - menuHeight - 6

      if (left + menuWidth > viewportWidth - 8) {
        left = Math.max(8, viewportWidth - menuWidth - 8)
      }
      if (top < 8) {
        top = Math.min(viewportHeight - menuHeight - 8, rect.bottom + 6)
      }

      this.agentModeMenuPosition = {
        left: Math.round(left),
        top: Math.round(top)
      }
    },
    selectAgentMode(mode) {
      if (this.isStreaming) return
      if (!AGENT_MODE_LABELS[mode]) return
      this.agentMode = mode
      this.agentModeMenuOpen = false
      saveAgentMode(this.agentMode, this.currentUserId)
      if (this.agentMode === 'simple') {
        this.removeAllAttachments()
      }
    },
    async handleSend() {
      if (!this.canSend) return
      if (this.hasAttachment && this.agentMode !== 'thinking') {
        this.$message.warning('Attachments are only supported in Thinking mode.')
        return
      }
      const message = this.questionText.trim()
      if (!this.isTimeRangeValid()) {
        this.$message.warning('End time must be later than start time.')
        return
      }
      const agentMessage = mapDisplayQuestionToInternal(message)
      this.applyMappedSiteContext(message)
      this.phase = 'chat'
      this.isStreaming = true
      this.stopRequested = false
      this.suppressStopMessage = false
      this.streamAbortController = new AbortController()
      this.resetStreamState()
      this.beginStreamProgress()
      this.questionText = ''

      this.messages.push({
        id: createMessageId(),
        role: 'user',
        content: message,
        attachments: this.attachments
          .filter(item => item.status === 'ready')
          .map(item => ({ name: item.name, type: item.file?.type || '' })),
        timestamp: Date.now()
      })
      this.persistCurrentConversation()
      this.$nextTick(() => this.scrollChatToBottom())

      const requestAccessVersion=getContextVersion()
      let finalResponse = null
      let streamError = null
      try {
        const userContext = await this.buildCurrentUserContext()
        const payload = {
          message: agentMessage,
          conversation_id: this.conversationId,
          agent_mode: this.agentMode,
          response_language: 'auto',
          site_scope: this.getOutboundSiteScope(message),
          time_range: this.buildTimeRange(),
          user_context: userContext,
          dry_run: true,
          attachment_ids: [...this.readyAttachmentIds]
        }

        await streamChatMessage(payload, (event) => {
          if (streamError) return
          try {
            const displayEvent = mapAgentResponseToDisplay(event, this.sites, this.selectedSiteIds)
            if (displayEvent.type === 'error') {
              streamError = new AgentApiError(displayEvent.message || 'Stream request failed', 500, displayEvent)
              this.streamAbortController && this.streamAbortController.abort()
              return
            }
            this.handleStreamEvent(displayEvent)
            if (displayEvent.type === 'response') {
              finalResponse = displayEvent.response
            }
          } catch (error) {
            streamError = error
          }
        }, { signal: this.streamAbortController.signal })

        if(requestAccessVersion!==getContextVersion())return
        if (streamError) throw streamError
        if (!finalResponse) {
          throw new AgentApiError('Stream ended without final response', 500)
        }

        await this.handleChatResponse(finalResponse)
      } catch (error) {
        if(requestAccessVersion!==getContextVersion())return
        if (streamError) error = streamError
        const wasStopped = this.stopRequested && error?.name === 'AbortError'
        if (wasStopped && !this.suppressStopMessage) {
          const partial = this.streamingOutput.trim()
          this.pushAgentMessage({
            content: partial ? `${partial}\n\nGeneration stopped.` : 'Generation stopped.',
            response: null
          })
        } else if (!wasStopped) {
          this.pushAgentMessage({
            content: this.formatError(error),
            response: null,
            isError: true
          })
        }
        if (this.messages.length) this.persistCurrentConversation()
      } finally {
        if(requestAccessVersion!==getContextVersion())return
        this.isStreaming = false
        this.streamAbortController = null
        this.stopRequested = false
        this.suppressStopMessage = false
        this.resetStreamState()
        this.$nextTick(() => this.scrollChatToBottom())
      }
    },
    stopGeneration({ silent = false, suppressMessage = false } = {}) {
      if (!this.isStreaming || !this.streamAbortController) return
      this.stopRequested = true
      this.suppressStopMessage = suppressMessage
      this.streamAbortController.abort()
      if (!silent) {
        this.streamActivityTitle = 'Stopping generation'
        this.streamActivityDetail = ''
        this.streamPhase = 'stopping'
        this.completeRunningStreamActivities()
        this.upsertStreamActivity('stopping', {
          label: 'Stopping generation',
          status: 'running',
          kind: 'system'
        })
      }
    },
    pushAgentMessage({ content, response, isError = false }) {
      const displayContent = String(content || '')
      const displayResponse = response || null
      const parsedReport = extractReportBlock(displayContent)
      const message = {
        id: createMessageId(),
        role: 'agent',
        content: displayContent,
        reportContent: structuredReportMarkdown(displayResponse) || parsedReport.reportContent,
        reportFiles: structuredReportFiles(displayResponse),
        response: displayResponse,
        timestamp: Date.now(),
        isError
      }
      this.messages.push(message)
      this.ensureChartsDefaultCollapsed(message.id, this.getMessageCharts(message), { render: false })
      this.$nextTick(() => this.renderChartsInDialog())
    },
    resetStreamState() {
      if (this.streamElapsedTimer) {
        clearInterval(this.streamElapsedTimer)
        this.streamElapsedTimer = null
      }
      this.streamActivityTitle = 'Agent is processing'
      this.streamActivityDetail = ''
      this.streamActivitySteps = []
      this.streamPhase = 'idle'
      this.streamActivities = []
      this.streamStartedAt = null
      this.streamElapsedSeconds = 0
      this.streamProgressExpanded = false
      this.streamingOutput = ''
      this.streamingCharts = []
      this.clearChartCollapseState('streaming:')
      this.disposeCharts('streaming:')
    },
    beginStreamProgress() {
      this.streamPhase = 'analysing'
      this.streamStartedAt = Date.now()
      this.streamElapsedSeconds = 0
      this.streamProgressExpanded = this.agentMode === 'thinking'
      this.upsertStreamActivity('request', {
        label: 'Understanding request',
        status: 'running',
        kind: 'analysis'
      })
      this.streamElapsedTimer = setInterval(() => {
        if (!this.streamStartedAt) return
        this.streamElapsedSeconds = Math.max(0, Math.floor((Date.now() - this.streamStartedAt) / 1000))
      }, 1000)
    },
    upsertStreamActivity(key, activity = {}) {
      const normalizedKey = String(key || activity.label || createMessageId())
      const index = this.streamActivities.findIndex(item => item.key === normalizedKey)
      const next = {
        key: normalizedKey,
        label: normalizeInterfaceText(activity.label, 'Processing'),
        detail: normalizeInterfaceText(activity.detail, ''),
        status: activity.status || 'pending',
        kind: activity.kind || 'activity',
        toolName: activity.toolName || '',
        updatedAt: Date.now()
      }
      if (index >= 0) {
        const activities = [...this.streamActivities]
        activities.splice(index, 1, { ...activities[index], ...next })
        this.streamActivities = activities
      } else {
        this.streamActivities = [...this.streamActivities, next].slice(-12)
      }
    },
    completeRunningStreamActivities(kinds = null) {
      this.streamActivities = this.streamActivities.map(activity => {
        const matchesKind = !Array.isArray(kinds) || kinds.includes(activity.kind)
        if (matchesKind && activity.status === 'running') {
          return { ...activity, status: 'completed', updatedAt: Date.now() }
        }
        return activity
      })
    },
    activateNextPendingTool() {
      const next = this.streamActivities.find(activity => activity.kind === 'tool' && activity.status === 'pending')
      if (!next) return
      this.upsertStreamActivity(next.key, { ...next, status: 'running' })
    },
    streamActivityStateLabel(activity) {
      if (!activity) return ''
      if (activity.status === 'completed') return 'Completed'
      if (activity.status === 'warning') return 'Issue'
      if (activity.status === 'failed') return 'Failed'
      if (activity.status === 'running') return 'Running'
      return 'Waiting'
    },
    toggleStreamProgress() {
      this.streamProgressExpanded = !this.streamProgressExpanded
    },
    pushStreamStep(text) {
      const normalized = normalizeInterfaceText(text)
      if (!normalized) return
      this.streamActivitySteps = [...this.streamActivitySteps, normalized].slice(-5)
    },
    handleStreamEvent(rawEvent) {
      const event = rawEvent
      if (event.type === 'session') {
        if (event.conversation_id) {
          const previousHistoryId = this.activeHistoryId
          this.conversationId = event.conversation_id
          this.activeHistoryId = event.conversation_id
          saveConversationId(event.conversation_id, this.currentUserId)
          if (previousHistoryId && previousHistoryId !== event.conversation_id) {
            this.conversationHistory = this.conversationHistory.filter(item => item.id !== previousHistoryId)
          }
          this.persistCurrentConversation()
        }
        this.streamActivityTitle = 'Agent started'
        this.streamActivityDetail = event.model ? `Model: ${event.model}` : ''
        return
      }
      if (event.type === 'activity') {
        this.completeRunningStreamActivities(['analysis', 'activity'])
        const activityTitle = normalizeInterfaceText(event.title || event.stage, 'Processing')
        this.streamActivityTitle = activityTitle
        this.streamActivityDetail = normalizeInterfaceText(event.detail, '')
        this.streamPhase = 'analysing'
        const activityToken = activityTitle.toLowerCase()
        const activityKey = activityToken.includes('understanding')
          ? 'request'
          : `activity:${String(event.stage || activityTitle).toLowerCase().replace(/\s+/g, '-')}`
        this.upsertStreamActivity(activityKey, {
          label: activityTitle,
          detail: event.detail || '',
          status: 'running',
          kind: 'activity'
        })
        this.pushStreamStep(event.title || event.stage || 'Running')
        return
      }
      if (event.type === 'tool_calls') {
        const names = (event.calls || [])
          .map(call => normalizeInterfaceText(call.name, 'tool'))
          .filter(Boolean)
        this.completeRunningStreamActivities(['analysis', 'activity'])
        this.streamPhase = 'tools'
        this.streamActivityTitle = 'Preparing tool calls'
        this.streamActivityDetail = names.join(', ') || 'Selecting suitable tools'
        names.forEach((name, index) => {
          this.upsertStreamActivity(`tool:${name}:${index}`, {
            label: name,
            detail: index === 0 ? 'Executing tool' : 'Queued',
            status: index === 0 ? 'running' : 'pending',
            kind: 'tool',
            toolName: name
          })
          this.pushStreamStep(`Calling ${name}`)
        })
        return
      }
      if (event.type === 'tool_result') {
        const tool = event.tool || {}
        const ok = !['error', 'invalid_argument', 'blocked'].includes(tool.status)
        const toolName = normalizeInterfaceText(tool.name, 'tool')
        const toolSummary = normalizeInterfaceText(tool.summary || tool.status, '')
        const toolStatus = normalizeInterfaceText(tool.status, '')
        const activity = this.streamActivities.find(item => item.kind === 'tool' && item.toolName === toolName && ['pending', 'running'].includes(item.status))
        const activityKey = activity?.key || `tool-result:${toolName}:${this.streamActivities.length}`
        this.upsertStreamActivity(activityKey, {
          label: toolName,
          detail: toolSummary,
          status: ok ? 'completed' : 'warning',
          kind: 'tool',
          toolName
        })
        this.activateNextPendingTool()
        this.streamActivityTitle = ok ? 'Tool completed' : 'Tool returned an issue'
        this.streamActivityDetail = toolSummary ? `${toolName}: ${toolSummary}` : toolName
        this.pushStreamStep(toolStatus ? `${toolName} · ${toolStatus}` : toolName)
        return
      }
      if (event.type === 'chart_data') {
        if (event.chart && hasRenderableChart(event.chart)) {
          this.streamPhase = 'chart'
          this.streamingCharts = [...this.streamingCharts, event.chart]
          this.ensureChartsDefaultCollapsed('streaming', this.streamingCharts, { render: false })
          this.streamActivityTitle = 'Chart generated'
          this.streamActivityDetail = normalizeInterfaceText(event.chart.title, 'Chart data returned')
          this.pushStreamStep(normalizeInterfaceText(event.chart.title, 'Generate chart'))
          this.upsertStreamActivity(`chart:${this.streamingCharts.length}`, {
            label: normalizeInterfaceText(event.chart.title, 'Chart prepared'),
            detail: 'Chart data prepared',
            status: 'completed',
            kind: 'chart'
          })
          this.$nextTick(() => this.renderChartsInDialog())
        }
        return
      }
      if (event.type === 'final') {
        this.completeRunningStreamActivities()
        this.streamActivities = this.streamActivities.map(activity => (
          activity.status === 'pending'
            ? { ...activity, status: 'completed', updatedAt: Date.now() }
            : activity
        ))
        this.streamPhase = 'completed'
        this.upsertStreamActivity('response', {
          label: 'Preparing response',
          status: 'completed',
          kind: 'response'
        })
        this.streamActivityTitle = 'Answer generated'
        this.streamActivityDetail = ''
        if (event.output) {
          this.streamingOutput = event.output
        }
      }
    },
    async handleChatResponse(response) {
      const displayResponse = response
      if (displayResponse.conversation_id) {
        const previousHistoryId = this.activeHistoryId
        this.conversationId = displayResponse.conversation_id
        this.activeHistoryId = displayResponse.conversation_id
        saveConversationId(displayResponse.conversation_id, this.currentUserId)
        if (previousHistoryId && previousHistoryId !== displayResponse.conversation_id) {
          this.conversationHistory = this.conversationHistory.filter(item => item.id !== previousHistoryId)
        }
      }

      if (isSiteDirectoryStale(displayResponse.display)) {
        await this.refreshSites()
        this.pushAgentMessage({
          content: displayResponse.display?.summary || 'The site directory has changed. Refresh sites and try again.',
          response: displayResponse,
          isError: true
        })
        return
      }

      const frontendActionResults = await this.executeFrontendActionsFromResponse(displayResponse)
      const frontendActionSummary = this.formatFrontendActionResults(frontendActionResults)
      const content = [
        this.resolveAgentContent(displayResponse),
        frontendActionSummary
      ].filter(Boolean).join('\n\n')

      this.pushAgentMessage({
        content,
        response: displayResponse
      })
      this.persistCurrentConversation()
    },
    async executeFrontendActionsFromResponse(response) {
      const actions = Array.isArray(response?.frontend_actions) ? response.frontend_actions : []
      if (!actions.length) return []
      const results = await executeAgentFrontendActions(actions)
      this.$set(response, 'frontend_action_results', results)
      return results
    },
    formatFrontendActionResults(results) {
      if (!Array.isArray(results) || !results.length) return ''
      const okCount = results.filter(item => item.status === 'ok').length
      const failed = results.filter(item => item.status !== 'ok')
      const lines = [`页面操作结果：成功 ${okCount}/${results.length}。`]
      failed.slice(0, 3).forEach(item => {
        lines.push(`- ${item.message || item.status || '执行失败'}`)
      })
      return lines.join('\n')
    },
    resolveAgentContent(response) {
      if (response?.answer) return response.answer
      const display = response?.display
      if (display?.detail) return display.detail
      if (display?.summary) return display.summary
      return 'Processed.'
    },
    getAgentStatusText(msg) {
      if (msg.isError && !msg.response) return 'Request failed'
      const display = msg.response?.display
      const status = display?.status || 'ok'
      if (['error', 'failed', 'blocked', 'invalid_argument'].includes(status)) {
        return normalizeInterfaceText(display?.title, 'Processing failed')
      }
      if (['warning', 'not_supported'].includes(status)) {
        return normalizeInterfaceText(display?.title, 'Answer generated')
      }
      return 'Answer generated'
    },
    getAgentStatusClass(msg) {
      const display = msg.response?.display
      const status = display?.status || (msg.isError ? 'error' : 'ok')
      if (msg.isError || ['error', 'failed', 'blocked', 'invalid_argument'].includes(status)) {
        return 'chat-message__status--error'
      }
      if (['warning', 'not_supported'].includes(status)) {
        return 'chat-message__status--warning'
      }
      return 'chat-message__status--ok'
    },
    getAgentStatusIcon(msg) {
      const display = msg.response?.display
      const status = display?.status || (msg.isError ? 'error' : 'ok')
      if (msg.isError || ['error', 'failed', 'blocked', 'invalid_argument'].includes(status)) {
        return '✕'
      }
      if (['warning', 'not_supported'].includes(status)) {
        return '!'
      }
      return '✓'
    },
    getMessageWarnings(msg) {
      if (msg.isError && !msg.response) {
        return [msg.content]
      }
      return [...(msg.response?.display?.warnings || []),...(msg.response?.frontend_action_results || []).filter(result=>result.status !== 'ok').map(result=>result.message)]
    },
    getMessageCharts(msg) {
      return getMessagePresentation(msg).charts
    },
    async captureMessageChartImages(msg) {
      const charts = this.getMessageCharts(msg)
      if (!charts.length) return []
      const images = []

      for (let index = 0; index < charts.length; index += 1) {
        const chartDef = charts[index]
        try {
          const seriesNames = (Array.isArray(chartDef?.series) ? chartDef.series : [])
            .map(series => series?.name)
            .filter(Boolean)
          const dataUrl = await captureChartDefinitionDataUrl(chartDef)
          const image = {
            id: chartDef?.id || '',
            title: chartDef?.title || `Chart ${index + 1}`,
            subtitle: chartDef?.subtitle || '',
            metric: chartDef?.metric || '',
            unit: chartDef?.unit || '',
            seriesNames,
            explanation: chartDef?.explanation || chartDef?.subtitle || '',
            dataUrl
          }
          images.push({
            ...image,
            keywords: buildChartImageKeywords(image)
          })
        } catch (error) {
          console.warn('Chart image capture failed:', error)
        }
      }

      return images
    },
    getRiskApprovalNotice(msg) {
      const response = msg.response
      if (!response) return null
      const riskLevel = response.risk_level
      const requiresApproval = !!response.requires_approval
      const status = response.display?.status
      const statusRisk = ['error', 'failed', 'blocked', 'invalid_argument', 'degraded', 'warning'].includes(status)
      const normalizedRisk = String(riskLevel || '').toLowerCase()
      const mediumRisk = ['l2', 'medium', 'warning', 'degraded'].includes(normalizedRisk)
      const shouldShowRiskNotice = requiresApproval || statusRisk || mediumRisk || this.isHighRiskLevel(riskLevel)
      if (!shouldShowRiskNotice) return null

      const meta = []
      if (riskLevel) meta.push({ key: 'risk', label: `Risk level ${riskLevel}` })
      if (status) meta.push({ key: 'status', label: `Status ${status}` })
      if (response.audit_id) meta.push({ key: 'audit', label: `Audit ID ${response.audit_id}` })

      if (requiresApproval) {
        return {
          title: 'Approval required before execution',
          detail: 'This result may affect equipment, strategy, or business state. Execute only after approval is complete.',
          className: 'chat-message__approval-card--approval',
          meta
        }
      }
      if (this.isHighRiskLevel(riskLevel) || ['error', 'failed', 'blocked', 'invalid_argument'].includes(status)) {
        return {
          title: 'High-risk or blocked result',
          detail: 'Review the evidence, tool calls, and site context before deciding what to do next.',
          className: 'chat-message__approval-card--danger',
          meta
        }
      }
      return {
        title: 'Review risk notice',
        detail: 'This answer contains warnings, degraded status, or medium-risk information. Confirm it against evidence and current site conditions.',
        className: 'chat-message__approval-card--warning',
        meta
      }
    },
    isHighRiskLevel(value) {
      return ['l3', 'high', 'critical'].includes(String(value || '').toLowerCase())
    },
    getNextActions(msg) {
      const actions = msg.response?.display?.next_actions
      return Array.isArray(actions) ? actions : []
    },
    getToolCalls(msg) {
      const calls = msg.response?.tool_calls
      return Array.isArray(calls) ? calls : []
    },
    getAttachmentReferences(msg) {
      const refs = msg.response?.attachment_references
      return Array.isArray(refs) ? refs : []
    },
    chartDomKey(messageId, chartIndex) {
      return `${messageId}:${chartIndex}`
    },
    ensureChartsDefaultCollapsed(messageId, charts, options = {}) {
      let changed = false
      ;(charts || []).forEach((chart, index) => {
        const key = this.chartDomKey(messageId, index)
        if (this.initializedChartCollapseIds[key]) return
        this.$set(this.initializedChartCollapseIds, key, true)
        if (isSocPcsTrendChartDefinition(chart)) {
          this.$delete(this.collapsedChartIds, key)
        } else {
          this.$set(this.collapsedChartIds, key, true)
          this.disposeChart(key)
        }
        changed = true
      })
      if (changed && options.render !== false) {
        this.$nextTick(() => this.renderChartsInDialog())
      }
    },
    ensureAllMessageChartsDefaultCollapsed(options = {}) {
      ;(this.messages || []).forEach(message => {
        this.ensureChartsDefaultCollapsed(message.id, this.getMessageCharts(message), { render: false })
      })
      if (options.render !== false) {
        this.$nextTick(() => this.renderChartsInDialog())
      }
    },
    isChartCollapsed(messageId, chartIndex) {
      return !!this.collapsedChartIds[this.chartDomKey(messageId, chartIndex)]
    },
    hasCollapsedCharts(messageId, charts) {
      return (charts || []).some((_chart, index) => this.isChartCollapsed(messageId, index))
    },
    areAllChartsCollapsed(messageId, charts) {
      return !!(charts || []).length && charts.every((_chart, index) => this.isChartCollapsed(messageId, index))
    },
    setChartCollapsed(messageId, chartIndex, collapsed, options = {}) {
      const key = this.chartDomKey(messageId, chartIndex)
      this.$set(this.initializedChartCollapseIds, key, true)
      if (collapsed) {
        this.$set(this.collapsedChartIds, key, true)
        this.disposeChart(key)
      } else {
        this.$delete(this.collapsedChartIds, key)
      }
      if (options.render !== false) {
        this.$nextTick(() => this.renderChartsInDialog())
      }
    },
    setAllChartsCollapsed(messageId, charts, collapsed, options = {}) {
      ;(charts || []).forEach((_chart, index) => {
        this.setChartCollapsed(messageId, index, collapsed, { render: false })
      })
      if (options.render !== false) {
        this.$nextTick(() => this.renderChartsInDialog())
      }
    },
    toggleChartCollapsed(messageId, chartIndex) {
      this.setChartCollapsed(messageId, chartIndex, !this.isChartCollapsed(messageId, chartIndex))
    },
    clearChartCollapseState(prefix = '') {
      Object.keys(this.collapsedChartIds || {}).forEach(key => {
        if (!prefix || key.indexOf(prefix) === 0) {
          this.$delete(this.collapsedChartIds, key)
        }
      })
      Object.keys(this.initializedChartCollapseIds || {}).forEach(key => {
        if (!prefix || key.indexOf(prefix) === 0) {
          this.$delete(this.initializedChartCollapseIds, key)
        }
      })
    },
    isMarketWindowChart(chart) {
      return isMarketWindowChartDefinition(chart)
    },
    isSocPcsTrendChart(chart) {
      return isSocPcsTrendChartDefinition(chart)
    },
    chartBodyStyle(chart) {
      return {
        height: `${Math.max(220, getChartHeight(chart))}px`
      }
    },
    getChartSummaryItems(chart) {
      if (isSocPcsTrendChartDefinition(chart)) {
        const trendItems = buildSocPcsTrendSummaryItems(chart)
        if (trendItems.length) return trendItems
      }
      const rawSummary = chart?.summary_items || chart?.summaryItems || chart?.summary || {}
      const unit = chart?.unit || ''
      const items = []
      if (Array.isArray(rawSummary)) {
        return rawSummary
          .map((item, index) => {
            if (item == null) return null
            if (typeof item !== 'object') {
              return {
                key: `summary-${index}`,
                label: `Metric ${index + 1}`,
                value: String(item),
                className: ''
              }
            }
            const label = item.label || item.name || item.key || `Metric ${index + 1}`
            const value = item.value ?? item.current ?? item.text ?? ''
            return {
              key: String(item.key || label || index),
              label,
              value: String(value),
              className: item.className || item.class || ''
            }
          })
          .filter(item => item && item.value !== '')
          .slice(0, 4)
      }
      const summary = rawSummary && typeof rawSummary === 'object' ? rawSummary : {}
      if (summary.min != null) items.push({ key: 'min', label: 'Min', value: `${summary.min}${unit}`, className: '' })
      if (summary.max != null) items.push({ key: 'max', label: 'Max', value: `${summary.max}${unit}`, className: '' })
      if (summary.avg != null) items.push({ key: 'avg', label: 'Avg', value: `${summary.avg}${unit}`, className: '' })
      if (summary.delta != null) {
        const delta = Number(summary.delta)
        const sign = delta > 0 ? '+' : ''
        items.push({
          key: 'delta',
          label: 'Change',
          value: `${Number.isFinite(delta) ? sign : ''}${summary.delta}${unit}`,
          className: delta >= 0 ? 'assistant-chart__summary-item--up' : 'assistant-chart__summary-item--down'
        })
      }
      return items
    },
    getChartByKey(messageId, chartIndex) {
      const index = Number(chartIndex)
      if (!Number.isInteger(index) || index < 0) return null
      if (messageId === 'streaming') {
        return this.streamingCharts[index]
      }
      const message = this.messages.find(item => item.id === messageId)
      return this.getMessageCharts(message || {})[index]
    },
    renderChartsInDialog() {
      if (!this.visible) return
      const root = this.$el
      if (!root) return
      const nodes = Array.from(root.querySelectorAll('.assistant-chart__body[data-chart-key]'))
      const liveKeys = new Set()

      nodes.forEach(node => {
        const key = node.dataset.chartKey
        const chartDef = this.getChartByKey(node.dataset.chartMessageId, node.dataset.chartIndex)
        if (!key || !chartDef || !hasRenderableChart(chartDef)) return
        liveKeys.add(key)
        if (!this.chartInstances) {
          this.chartInstances = Object.create(null)
        }
        if (!this.chartInstances[key]) {
          this.chartInstances[key] = echarts.init(node)
        }
        this.chartInstances[key].setOption(buildChartOption(chartDef), true)
        this.chartInstances[key].resize()
      })

      if (this.chartInstances) {
        Object.keys(this.chartInstances).forEach(key => {
          if (!liveKeys.has(key)) {
            this.disposeChart(key)
          }
        })
      }
    },
    resizeCharts() {
      if (!this.chartInstances) return
      Object.keys(this.chartInstances).forEach(key => {
        const chart = this.chartInstances[key]
        if (chart && !chart.isDisposed()) {
          chart.resize()
        }
      })
    },
    disposeChart(key) {
      if (!this.chartInstances || !this.chartInstances[key]) return
      const chart = this.chartInstances[key]
      if (chart && !chart.isDisposed()) {
        chart.dispose()
      }
      delete this.chartInstances[key]
    },
    disposeCharts(prefix = '') {
      if (!this.chartInstances) return
      Object.keys(this.chartInstances).forEach(key => {
        if (!prefix || key.indexOf(prefix) === 0) {
          this.disposeChart(key)
        }
      })
    },
    formatAnswer(text) {
      return formatAnswerHtml(text)
    },
    getReportParts(content) {
      return extractReportBlock(content)
    },
    getReportChatContent(content) {
      return extractReportBlock(content).chatContent
    },
    getMessageChatHtml(msg) {
      return getMessagePresentation(msg).chatHtml
    },
    getMessageChatContent(msg) {
      return getMessagePresentation(msg).chatContent
    },
    getMessageReport(msg) {
      return structuredReportMarkdown(msg?.response) || msg?.reportContent || extractReportBlock(msg?.content).reportContent
    },
    getMessageReportFiles(msg) {
      const files = structuredReportFiles(msg?.response)
      return files.length ? files : (Array.isArray(msg?.reportFiles) ? msg.reportFiles : [])
    },
    getMessageReportFile(msg, format) {
      return reportFileByFormat(this.getMessageReportFiles(msg), format)
    },
    hasMessageReportCard(msg) {
      return !!this.getMessageReport(msg) || this.getMessageReportFiles(msg).length > 0
    },
    hasMessageReportPdfPreview(msg) {
      return !!this.getMessageReportFile(msg, 'pdf')?.content_base64
    },
    hasMessageReportPdfDownload(msg) {
      return !!this.getMessageReportFile(msg, 'pdf') || !!this.getMessageReport(msg)
    },
    hasMessageReportMarkdown(msg) {
      return !!this.getMessageReportFile(msg, 'md') || !!this.getMessageReportFile(msg, 'markdown') || !!this.getMessageReport(msg)
    },
    hasMessageReportDocx(msg) {
      return !!this.getMessageReportFile(msg, 'docx')
    },
    getMessageReportTitle(msg) {
      return reportFileTitle(this.getMessageChatContent(msg), msg?.response)
    },
    getMessageReportFilename(msg, extension = 'md') {
      const file = this.getMessageReportFile(msg, extension)
      if (file?.filename) return file.filename
      return buildReportFilename(this.getMessageReportTitle(msg), extension)
    },
    getMessageReportShortFilename(msg, extension = 'md') {
      return shortenReportFilename(this.getMessageReportFilename(msg, extension))
    },
    formatMessageTime(timestamp) {
      return formatAgentDate(timestamp,{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})
    },
    formatFileSize(size) {
      const value = Number(size)
      if (!Number.isFinite(value) || value <= 0) return '0 KB'
      if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
      return `${Math.ceil(value / 1024)} KB`
    },
    toggleEvidence(messageId) {
      this.$set(this.expandedEvidenceIds, messageId, !this.expandedEvidenceIds[messageId])
    },
    isEvidenceExpanded(messageId) {
      return !!this.expandedEvidenceIds[messageId]
    },
    async copyMessageContent(msg) {
      const text = this.getMessageReport(msg) || msg.content || ''
      try {
        await navigator.clipboard.writeText(text)
        this.$message.success('Copied')
      } catch (error) {
        this.$message.warning('Copy failed')
      }
    },
    async downloadMessageReportMarkdown(msg) {
      const report = this.getMessageReport(msg)
      if (report) {
        const chartImages = await this.captureMessageChartImages(msg)
        if (chartImages.length) {
          downloadTextFile(
            buildReportMarkdownWithChartImages(report, chartImages),
            this.getMessageReportFilename(msg, 'md'),
            'text/markdown;charset=utf-8'
          )
          return
        }
      }
      const file = this.getMessageReportFile(msg, 'md') || this.getMessageReportFile(msg, 'markdown')
      if (file && downloadReportFile(file)) return
      if (!report) return
      downloadTextFile(report, this.getMessageReportFilename(msg, 'md'), 'text/markdown;charset=utf-8')
    },
    async downloadMessageReportPdf(msg) {
      const file = this.getMessageReportFile(msg, 'pdf')
      const report = this.getMessageReport(msg)
      if (!report && file && downloadReportFile(file)) return
      if (!report) return

      const title = this.getMessageReportTitle(msg)
      const ts = formatAgentDate(new Date(),{dateStyle:'short',timeStyle:'medium'})
      const chartImages = await this.captureMessageChartImages(msg)
      const html = buildReportHtmlWithChartImages(removeDuplicateReportTitleHeading(report, title), chartImages)
      const element = createReportPdfElement(title, html, ts)
      document.body.appendChild(element)

      try {
        await prepareReportPdfElementForExport(element, REPORT_PDF_MARGIN_MM)
        const html2pdfModule = await import('html2pdf.js')
        const html2pdf = html2pdfModule.default || html2pdfModule
        const worker = html2pdf()
          .set({
            filename: this.getMessageReportFilename(msg, 'pdf'),
            margin: REPORT_PDF_MARGIN_MM,
            image: { type: 'jpeg', quality: 0.96 },
            html2canvas: {
              scale: Math.min(2, window.devicePixelRatio || 1.5),
              useCORS: true,
              backgroundColor: '#ffffff',
              logging: false,
              scrollX: 0,
              windowWidth: Math.ceil(element.scrollWidth || element.getBoundingClientRect().width || 794)
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: {
              mode: ['css', 'legacy'],
              avoid: [
                '.report-heading-group',
                '.report-block',
                'p',
                'li',
                'blockquote',
                'pre',
                '.chart-image',
                '.chart-image-section',
                '.table-wrapper--short',
                'table.is-short-table',
                'tr'
              ]
            }
          })
          .from(element)
          .toPdf()
        const pdf = await worker.get('pdf')
        addReportPdfPageChrome(pdf, { title, generatedAt: ts })
        pdf.save(this.getMessageReportFilename(msg, 'pdf'))
        this.$message.success('PDF download started')
      } catch (error) {
        console.error('PDF download failed:', error)
        this.$message.error('PDF download failed')
      } finally {
        if (element.parentNode) {
          element.parentNode.removeChild(element)
        }
      }
    },
    async previewMessageReportPdf(msg) {
      const report = this.getMessageReport(msg)
      if (report) {
        const previewWindow = window.open('', '_blank')
        if (!previewWindow) {
          this.$message.warning('PDF preview tab was blocked. Please allow pop-ups or use Download PDF.')
          return
        }
        previewWindow.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Preparing report preview</title></head><body>Preparing report preview...</body></html>')
        previewWindow.document.close()
        const title = this.getMessageReportTitle(msg)
        const ts = formatAgentDate(new Date(),{dateStyle:'short',timeStyle:'medium'})
        const chartImages = await this.captureMessageChartImages(msg)
        const html = buildReportHtmlWithChartImages(removeDuplicateReportTitleHeading(report, title), chartImages)
        openReportPreviewWindow(title, html, ts, previewWindow)
        return
      }
      const file = this.getMessageReportFile(msg, 'pdf')
      if (file?.content_base64) {
        openBase64File(file.content_base64, file.mime_type || 'application/pdf')
        return
      }
      this.$message.warning('PDF preview is unavailable. Please download the report instead.')
    },
    downloadMessageReportDocx(msg) {
      const file = this.getMessageReportFile(msg, 'docx')
      if (file && downloadReportFile(file)) {
        this.$message.success('Word download started')
        return
      }
      this.$message.warning('Word file is unavailable. Please regenerate the report export.')
    },
    scrollChatToBottom() {
      const el = this.$refs.chatBody
      if (el) {
        el.scrollTop = el.scrollHeight
      }
    },
    selectQuickPrompt(text) {
      if (this.isStreaming) return
      this.questionText = text
      this.handleSend()
    },
    getCurrentHistoryId() {
      return this.activeHistoryId || this.conversationId || (this.messages[0] && this.messages[0].id) || null
    },
    persistCurrentConversation() {
      if (!this.messages.length) return
      const now = Date.now()
      const id = this.getCurrentHistoryId() || createMessageId()
      this.activeHistoryId = id
      const existing = this.conversationHistory.find(item =>
        item.id === id || (this.conversationId && item.conversationId === this.conversationId)
      )
      const item = sanitizeHistoryItem({
        id,
        conversationId: this.conversationId,
        title: existing?.title || deriveHistoryTitle(this.messages),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        agentMode: this.agentMode,
        selectedSiteIds: [...this.selectedSiteIds],
        timeStart: this.timeStart,
        timeEnd: this.timeEnd,
        messages: this.messages
      })
      const next = [
        item,
        ...this.conversationHistory.filter(historyItem =>
          historyItem.id !== item.id &&
          (!item.conversationId || historyItem.conversationId !== item.conversationId)
        )
      ]
      this.conversationHistory = saveConversationHistory(next, this.currentUserId)
    },
    toggleHistoryPanel() {
      this.conversationHistory = loadConversationHistory(this.currentUserId)
      this.historyPanelOpen = !this.historyPanelOpen
      if (this.historyPanelOpen) {
        this.systemPanelOpen = false
        this.agentModeMenuOpen = false
      }
    },
    closeHistoryPanel() {
      this.historyPanelOpen = false
      this.agentModeMenuOpen = false
    },
    isCurrentHistoryItem(item) {
      return !!item && (
        item.id === this.activeHistoryId ||
        (!!this.conversationId && item.conversationId === this.conversationId)
      )
    },
    openHistoryConversation(item) {
      if (this.isStreaming || !item) return
      const conversation = sanitizeHistoryItem(item)
      this.disposeCharts()
      this.removeAllAttachments()
      this.conversationId = conversation.conversationId
      this.activeHistoryId = conversation.id
      saveConversationId(conversation.conversationId, this.currentUserId)
      this.agentMode = conversation.agentMode || this.agentMode
      saveAgentMode(this.agentMode, this.currentUserId)
      this.selectedSiteIds = sanitizeSiteIds(conversation.selectedSiteIds)
      this.siteScopeSource = this.selectedSiteIds.length ? SITE_SCOPE_SOURCES.HISTORY : SITE_SCOPE_SOURCES.NONE
      saveSelectedSiteIds(this.selectedSiteIds, this.currentUserId)
      this.timeStart = conversation.timeStart || ''
      this.timeEnd = conversation.timeEnd || ''
      this.handleContextSettingsChange()
      this.messages = conversation.messages.map(sanitizeHistoryMessage)
      this.expandedEvidenceIds = {}
      this.collapsedChartIds = {}
      this.initializedChartCollapseIds = {}
      this.ensureAllMessageChartsDefaultCollapsed({ render: false })
      this.questionText = ''
      this.selectedPresetIndex = null
      this.phase = 'chat'
      this.historyPanelOpen = false
      this.resetStreamState()
      this.$nextTick(() => {
        this.renderChartsInDialog()
        this.scrollChatToBottom()
      })
    },
    deleteHistoryConversation(item) {
      if (this.isStreaming || !item) return
      const confirmed = window.confirm('Delete this conversation?')
      if (!confirmed) return
      const isCurrent = this.isCurrentHistoryItem(item)
      this.conversationHistory = saveConversationHistory(
        this.conversationHistory.filter(historyItem =>
          historyItem.id !== item.id &&
          (!item.conversationId || historyItem.conversationId !== item.conversationId)
        ),
        this.currentUserId
      )
      if (isCurrent) {
        this.startNewChat({ keepHistoryOpen: true })
        this.historyPanelOpen = true
      }
    },
    getHistoryPreview(item) {
      const messages = Array.isArray(item?.messages) ? item.messages : []
      const lastMessage = [...messages].reverse().find(message => message.content)
      return trimText(getHistoryMessagePreviewContent(lastMessage) || 'No preview available', HISTORY_PREVIEW_LENGTH)
    },
    formatHistoryTime(timestamp) {
      const value = Number(timestamp)
      if (!Number.isFinite(value)) return ''
      return formatAgentDate(value, {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    },
    startNewChat(options = {}) {
      this.stopGeneration({ silent: true, suppressMessage: true })
      saveConversationId(null, this.currentUserId)
      this.conversationId = null
      this.activeHistoryId = null
      this.messages = []
      this.expandedEvidenceIds = {}
      this.collapsedChartIds = {}
      this.initializedChartCollapseIds = {}
      this.questionText = ''
      this.isStreaming = false
      this.selectedSiteIds = []
      this.siteScopeSource = SITE_SCOPE_SOURCES.NONE
      this.applyRouteSiteContext()
      this.resetStreamState()
      this.disposeCharts()
      this.removeAllAttachments()
      this.phase = 'welcome'
      this.selectedPresetIndex = null
      if (!options.keepHistoryOpen) {
        this.historyPanelOpen = false
      }
    },
    formatError(error) {
      if (error instanceof AgentApiError) {
        return mapInternalTextToDisplay(error.message, this.sites, this.selectedSiteIds)
      }
      return mapInternalTextToDisplay(error?.message || 'Unknown error', this.sites, this.selectedSiteIds)
    },
    selectPreset(index) {
      if (this.isStreaming) return
      this.selectedPresetIndex = index
      this.questionText = this.presetQuestions[index]
      this.$nextTick(() => {
        this.$refs.questionInput && this.$refs.questionInput.focus()
      })
    },
    onQuestionInput() {
      const matchedIndex = this.presetQuestions.findIndex(item => item === this.questionText)
      this.selectedPresetIndex = matchedIndex >= 0 ? matchedIndex : null
    },
    triggerAttach() {
      if (this.isStreaming) return
      this.$refs.fileInput && this.$refs.fileInput.click()
    },
    async handleFileChange(event) {
      const files = Array.from(event.target.files || [])
      if (!files.length) return
      event.target.value = ''
      if (this.isStreaming) {
        return
      }
      if (this.agentMode !== 'thinking') {
        this.$message.warning('Attachments are only supported in Thinking mode.')
        this.attachmentStatus = 'error'
        this.attachmentError = 'Thinking mode is required for attachments'
        return
      }

      const validFiles = []
      for (const file of files) {
        if (!isAllowedAttachment(file)) {
          this.$message.warning(`${file.name}: unsupported file type.`)
          continue
        }
        if (file.size > ATTACHMENT_MAX_SIZE) {
          this.$message.warning(`${file.name}: file size must not exceed 20MB.`)
          continue
        }
        validFiles.push(file)
      }
      if (!validFiles.length) return

      const additions = validFiles.map(file => ({
        localId: createMessageId(),
        file,
        name: file.name,
        previewUrl: isImageAttachmentFile(file) ? URL.createObjectURL(file) : '',
        status: 'uploading',
        attachmentId: null,
        error: ''
      }))
      this.attachments = [...this.attachments, ...additions]
      this.attachmentStatus = 'uploading'
      this.attachmentError = ''
      await Promise.all(additions.map(item => this.uploadAttachmentItem(item)))
      this.syncAttachmentStatus()
    },
    async uploadAttachmentItem(item) {
      try {
        const result = await uploadAttachment(item.file)
        if (result.status === 'unsupported' || !result.attachment_id) {
          throw new AgentApiError(
            (result.warnings || []).join(' ') || 'The attachment could not be processed.',
            400,
            result
          )
        }
        if (!this.attachments.some(attachment => attachment.localId === item.localId) || this.agentMode !== 'thinking') {
          deleteAttachment(result.attachment_id).catch(() => {})
          return
        }
        item.attachmentId = result.attachment_id
        item.status = 'ready'
      } catch (error) {
        item.status = 'error'
        item.error = this.formatError(error)
      }
    },
    syncAttachmentStatus() {
      if (this.attachments.some(item => item.status === 'uploading')) {
        this.attachmentStatus = 'uploading'
        return
      }
      const failed = this.attachments.find(item => item.status === 'error')
      this.attachmentStatus = failed ? 'error' : (this.attachments.length ? 'ready' : 'idle')
      this.attachmentError = failed?.error || ''
    },
    attachmentExtension(filename) {
      const extension = getAttachmentExtension(filename).replace('.', '').toUpperCase()
      return extension || 'FILE'
    },
    attachmentStateLabel(attachment) {
      if (attachment.status === 'uploading') return 'Uploading'
      if (attachment.status === 'error') return 'Failed'
      return 'Ready'
    },
    async removeAttachment(localId) {
      const attachment = this.attachments.find(item => item.localId === localId)
      if (!attachment) return
      this.attachments = this.attachments.filter(item => item.localId !== localId)
      this.revokeAttachmentPreviews([attachment])
      this.syncAttachmentStatus()
      if (this.$refs.fileInput) {
        this.$refs.fileInput.value = ''
      }
      if (attachment.attachmentId) {
        try {
          await deleteAttachment(attachment.attachmentId)
        } catch (error) {
          this.$message.warning(`Could not delete ${attachment.name} from the Agent service.`)
        }
      }
    },
    removeAllAttachments() {
      const attachments = [...this.attachments]
      this.attachments = []
      this.revokeAttachmentPreviews(attachments)
      this.syncAttachmentStatus()
      if (this.$refs.fileInput) this.$refs.fileInput.value = ''
      attachments.forEach(item => {
        if (item.attachmentId) {
          deleteAttachment(item.attachmentId).catch(() => {})
        }
      })
    },
    revokeAttachmentPreviews(attachments = this.attachments) {
      attachments.forEach(item => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
      })
    },
    resetDialog() {
      this.stopGeneration({ silent: true, suppressMessage: true })
      this.phase = 'welcome'
      this.selectedPresetIndex = null
      this.questionText = ''
      this.messages = []
      this.expandedEvidenceIds = {}
      this.collapsedChartIds = {}
      this.initializedChartCollapseIds = {}
      this.isStreaming = false
      this.agentModeMenuOpen = false
      this.resetStreamState()
      this.disposeCharts()
      this.removeAllAttachments()
      this.activeHistoryId = null
      this.selectedSiteIds = []
      this.siteScopeSource = SITE_SCOPE_SOURCES.NONE
      this.historyPanelOpen = false
      this.systemPanelOpen = false
      this.contextPanelOpen = false
      this.isFullscreen = false
      this.drawerWidthBeforeFullscreen = null
    },
    handleDialogHidden() {
      this.stopGeneration({silent:true,suppressMessage:true})
      this.agentModeMenuOpen = false
      this.historyPanelOpen = false
      this.systemPanelOpen = false
      this.contextPanelOpen = false
      this.isFullscreen = false
      this.drawerWidthBeforeFullscreen = null
      this.isDrawerResizing = false
      document.body.classList.remove('assistant-dialog-resizing')
      this.disposeCharts()
    },
    handleClose() {
      this.$emit('update:visible', false)
      this.$emit('close')
    },
    onKeydown(event) {
      if (event.key === 'Escape') {
        this.agentModeMenuOpen = false
        this.contextPanelOpen = false
        this.historyPanelOpen = false
        this.systemPanelOpen = false
      }
      if (event.key === 'Escape' && this.visible) {
        if (this.isFullscreen) {
          this.toggleFullscreen()
        }
      }
    },
    onDocumentClick(event) {
      const target = event?.target
      if (!target) return
      const path = this.getEventPath(event)

      const menu = this.$el && this.$el.querySelector('.assistant-dialog__model-menu')
      if (this.agentModeMenuOpen && !this.isEventInsideElement(target, path, menu)) {
        this.agentModeMenuOpen = false
      }

      if (!this.visible) return
      this.closeContextPanelOnOutsideClick(target, path)

      const dialog = this.$el && this.$el.querySelector('.assistant-dialog')
      if (this.isEventInsideElement(target, path, dialog)) return
      if (this.shouldIgnoreOutsideDialogClick(target, path)) return
      this.handleClose()
    },
    closeContextPanelOnOutsideClick(target, path = []) {
      if (!this.contextPanelOpen) return
      const root = this.$el
      const summary = root && root.querySelector('.assistant-dialog__context-summary')
      const controls = root && root.querySelector('.assistant-dialog__context-controls')
      if (this.isEventInsideElement(target, path, summary)) return
      if (this.isEventInsideElement(target, path, controls)) return
      if (this.shouldIgnoreContextPanelOutsideClick(target, path)) return
      this.contextPanelOpen = false
    },
    getEventPath(event) {
      return typeof event?.composedPath === 'function' ? event.composedPath() : []
    },
    isEventInsideElement(target, path, element) {
      if (!element) return false
      if (Array.isArray(path) && path.includes(element)) return true
      return !!(target && element.contains && element.contains(target))
    },
    hasPathOrClosestMatch(target, path, selectors) {
      const selector = selectors.join(', ')
      if (target && typeof target.closest === 'function' && target.closest(selector)) return true
      return Array.isArray(path) && path.some(item =>
        item && typeof item.closest === 'function' && item.closest(selector)
      )
    },
    shouldIgnoreContextPanelOutsideClick(target, path = []) {
      return this.hasPathOrClosestMatch(target, path, [
        '.coliopt-context-site-popper',
        '.el-select-dropdown',
        '.el-picker-panel',
        '.el-message',
        '.el-notification'
      ])
    },
    shouldIgnoreOutsideDialogClick(target, path = []) {
      return this.hasPathOrClosestMatch(target, path, [
        '.floating-bubble',
        '.coliopt-context-site-popper',
        '.el-select-dropdown',
        '.el-picker-panel',
        '.el-message',
        '.el-notification'
      ])
    }
  }
}
</script>

<style scoped lang="scss">
.assistant-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(24, 36, 45, 0.08);
}

.assistant-dialog {
  --coliopt-primary: #1677c8;
  --coliopt-primary-hover: #0f66ad;
  --coliopt-primary-soft: #edf6fc;
  --coliopt-ink: #1d2935;
  --coliopt-muted: #5f6f7e;
  --coliopt-border: #dce5ec;
  --coliopt-surface-muted: #f5f8fa;
  position: fixed;
  right: 0;
  top: 0 !important;
  width: 500px;
  // height: 860px;
  height: 100%;
  background: #fff;
  border-radius: 12px 0 0 12px;
  overflow: hidden;
  box-shadow: -12px 0 32px rgba(29, 41, 53, 0.16);
  display: flex;
  flex-direction: column;
  transition: none;

  button:focus-visible,
  input:focus-visible,
  textarea:focus-visible {
    outline: 2px solid rgba(22, 119, 200, 0.34);
    outline-offset: 2px;
  }

  &.is-resizing {
    transition: none;
  }

  &__resize-handle {
    position: absolute;
    left: 0;
    top: 0;
    z-index: 7;
    width: 10px;
    height: 100%;
    cursor: ew-resize;
    touch-action: none;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      width: 2px;
      height: 100%;
      background: transparent;
      transition: background-color 0.16s ease, box-shadow 0.16s ease;
    }

    &::after {
      content: '';
      position: absolute;
      left: 3px;
      top: 50%;
      width: 3px;
      height: 34px;
      border-radius: 999px;
      background: #c8d6e6;
      transform: translateY(-50%);
      opacity: 0;
      transition: opacity 0.16s ease, background-color 0.16s ease;
    }

    &:hover::before,
    &:focus-visible::before {
      background: #1a6bc3;
      box-shadow: 0 0 0 1px rgba(26, 107, 195, 0.16);
    }

    &:hover::after,
    &:focus-visible::after {
      opacity: 1;
      background: #1a6bc3;
    }
  }

  &.is-resizing &__resize-handle::before {
    background: #1a6bc3;
    box-shadow: 0 0 0 1px rgba(26, 107, 195, 0.16);
  }

  &.is-resizing &__resize-handle::after {
    opacity: 1;
    background: #1a6bc3;
  }

  &__header {
    position: relative;
    flex-shrink: 0;
    width: 100%;
    height: 58px;
    border-bottom: 1px solid var(--coliopt-border);
    background: #fff;
  }

  &__header-bg {
    display: none;
  }

  &__header-inner {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: 100%;
    padding: 8px 14px 8px 16px;
    box-sizing: border-box;
  }

  &__header-brand {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
  }

  &__header-avatar {
    flex: 0 0 auto;
    width: 30px;
    height: 30px;
    object-fit: contain;
  }

  &__header-title {
    min-width: 0;

    p {
      margin: 0;
      font-family: Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif;
      font-size: 14px;
      font-weight: 600;
      line-height: 18px;
      letter-spacing: 0;
      color: var(--coliopt-ink);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    span {
      display: block;
      margin-top: 1px;
      color: #708090;
      font-size: 10px;
      line-height: 12px;
    }
  }

  &__header-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 5px;
    width: auto;
    height: 30px;
  }

  &__history-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 9px;
    border: 1px solid #dbe4ee;
    border-radius: 6px;
    background: var(--coliopt-surface-muted);
    color: #506170;
    font-size: 11px;
    line-height: 18px;
    cursor: pointer;
    transition: border-color 0.16s ease, background-color 0.16s ease, color 0.16s ease;

    span {
      display: block;
      max-width: 58px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 999px;
      background: #edf3f8;
      color: #1a6bc3;
      font-size: 11px;
      font-weight: 600;
      box-sizing: border-box;
    }

    &:hover,
    &.is-active {
      border-color: #9fc5df;
      background: var(--coliopt-primary-soft);
      color: var(--coliopt-primary-hover);
    }
  }

  &__system-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 8px;
    border: 1px solid #dbe4ee;
    border-radius: 6px;
    background: var(--coliopt-surface-muted);
    color: #526170;
    font-size: 11px;
    white-space: nowrap;
    cursor: pointer;

    &.is-active,
    &:hover {
      border-color: #9dbbd9;
      background: #fff;
      color: var(--coliopt-primary-hover);
    }
  }

  &__system-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #a7b2bd;
  }

  &__system-btn.is-ready &__system-dot {
    background: #238636;
    box-shadow: 0 0 0 3px rgba(35, 134, 54, 0.12);
  }

  &__context {
    flex-shrink: 0;
    border-bottom: 1px solid #e6edf4;
    background: var(--coliopt-surface-muted);
  }

  &__context-summary {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 40px;
    padding: 6px 14px 6px 16px;
    border: 0;
    background: transparent;
    color: var(--coliopt-muted);
    font-size: 11px;
    text-align: left;
    cursor: pointer;

    strong {
      flex: 0 0 auto;
      color: var(--coliopt-ink);
      font-size: 11px;
      font-weight: 600;
    }

    span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    > i:last-child {
      flex: 0 0 auto;
      margin-left: auto;
      color: #667887;
      font-size: 12px;
    }
  }

  &__context-summary-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;

    i {
      flex: 0 0 auto;
      color: #718392;
      font-size: 12px;
    }
  }

  &__context-controls {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    padding: 12px 16px 14px;
    border-top: 1px solid #e7edf3;
    background: #fff;
  }

  &__context-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;

    &--wide {
      grid-column: span 2;
    }

    > span {
      color: #697785;
      font-size: 10px;
      line-height: 14px;
    }

    > input {
      width: 100%;
      height: 28px;
      padding: 0 7px;
      border: 1px solid #d8e1ea;
      border-radius: 4px;
      outline: none;
      color: #25313c;
      font-size: 11px;
      box-sizing: border-box;

      &:focus {
        border-color: #5596d6;
        box-shadow: 0 0 0 2px rgba(26, 107, 195, 0.1);
      }
    }

    ::v-deep .el-select {
      width: 100%;
    }
  }

  &__header-btn,
  &__close-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 5px;
    border: none;
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
    box-sizing: border-box;

    i {
      display: block;
      color: #667482;
      font-size: 15px;
      line-height: 1;
    }

    &:hover {
      background: var(--coliopt-surface-muted);

      i {
        color: var(--coliopt-primary-hover);
      }
    }

    img {
      display: block;
      width: 20px;
      height: 20px;
    }
  }

  &__content {
    position: relative;
    flex: 1;
    width: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  &__system-panel {
    position: absolute;
    inset: 12px;
    z-index: 5;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border: 1px solid #dfe8f2;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 4px 8px rgba(15, 23, 42, 0.1);
    overflow: hidden;

    > input {
      height: 32px;
      margin: 10px 12px 6px;
      padding: 0 9px;
      border: 1px solid #d8e1ea;
      border-radius: 4px;
      outline: none;
      font-size: 12px;
    }
  }

  &__system-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 13px 14px 10px;
    border-bottom: 1px solid #edf2f7;
    background: #f8fbff;

    h3,
    p {
      margin: 0;
    }

    h3 {
      color: #1e2b36;
      font-size: 14px;
      line-height: 20px;
    }

    p {
      margin-top: 2px;
      color: #667482;
      font-size: 11px;
    }

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      padding: 0;
      border: 1px solid #dbe4ee;
      border-radius: 4px;
      background: #fff;
      color: #526170;
      font-size: 11px;
      cursor: pointer;

      &:hover {
        border-color: #aac3d6;
        color: var(--coliopt-primary-hover);
      }
    }
  }

  &__system-statuses {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 10px 12px 0;

    span {
      padding: 3px 7px;
      border: 1px solid #e0e6ec;
      border-radius: 4px;
      background: #f5f7f9;
      color: #7a2630;
      font-size: 10px;

      &.is-ok {
        border-color: #bcdcc5;
        background: #f0f8f2;
        color: #236b3b;
      }
    }
  }

  &__system-tools {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 12px 12px;

    > div {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 2px 8px;
      padding: 9px 2px;
      border-bottom: 1px solid #edf1f5;

      strong {
        overflow: hidden;
        color: #24313d;
        font-size: 12px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      span {
        color: #667482;
        font-size: 10px;
      }

      p {
        grid-column: 1 / -1;
        margin: 0;
        color: #697785;
        font-size: 11px;
        line-height: 16px;
      }
    }
  }

  &__system-empty {
    padding: 18px 0;
    color: #7b8794;
    text-align: center;
  }

  &__history-panel {
    position: absolute;
    left: 12px;
    right: 12px;
    top: 12px;
    bottom: 12px;
    z-index: 4;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border: 1px solid #dfe8f2;
    border-radius: 10px;
    background: #fff;
    box-shadow: 0 4px 8px rgba(15, 23, 42, 0.1);
    overflow: hidden;
  }

  &__history-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 14px 11px;
    border-bottom: 1px solid #edf2f7;
    background: #f8fbff;

    h3 {
      margin: 0;
      color: rgba(0, 0, 0, 0.84);
      font-size: 14px;
      font-weight: 600;
      line-height: 20px;
    }

    p {
      margin: 2px 0 0;
      color: #667482;
      font-size: 11px;
      line-height: 16px;
    }
  }

  &__history-close {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid #dbe4ee;
    border-radius: 6px;
    background: #fff;
    color: #526170;
    font-size: 12px;
    cursor: pointer;

    &:hover {
      border-color: #b7cce4;
      color: #1a6bc3;
    }
  }

  &__history-empty {
    margin: 14px;
    padding: 18px 14px;
    border: 1px dashed #cfdbe8;
    border-radius: 8px;
    background: #fbfcfe;
    color: #667482;
    text-align: center;

    strong {
      display: block;
      color: rgba(0, 0, 0, 0.78);
      font-size: 13px;
      line-height: 18px;
    }

    p {
      margin: 5px auto 0;
      max-width: 34ch;
      font-size: 12px;
      line-height: 18px;
    }
  }

  &__history-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__history-item {
    display: flex;
    gap: 8px;
    align-items: stretch;
    padding: 9px;
    border: 1px solid #e3ebf3;
    border-radius: 8px;
    background: #fff;
    transition: border-color 0.16s ease, background-color 0.16s ease;

    &.is-active {
      border-color: #9fc4ee;
      background: #f7fbff;
    }
  }

  &__history-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 0;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;

    &:disabled {
      cursor: default;
      opacity: 0.62;
    }
  }

  &__history-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: rgba(0, 0, 0, 0.84);
    font-size: 13px;
    font-weight: 600;
    line-height: 18px;
  }

  &__history-meta {
    color: #667482;
    font-size: 11px;
    line-height: 16px;
  }

  &__history-preview {
    display: -webkit-box;
    overflow: hidden;
    color: rgba(0, 0, 0, 0.62);
    font-size: 12px;
    line-height: 17px;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  &__history-actions {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 58px;
  }

  &__history-action {
    height: 26px;
    padding: 0 6px;
    border: 1px solid #dbe4ee;
    border-radius: 6px;
    background: #fff;
    color: #1a6bc3;
    font-size: 11px;
    cursor: pointer;

    &:disabled {
      color: #9aa6b2;
      cursor: default;
    }

    &--danger {
      color: #b42323;
    }
  }

  &__welcome {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 20px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 32px 24px 24px;
    box-sizing: border-box;
  }

  &__chat-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 14px 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  &__quick-row {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    flex-shrink: 0;
    padding-bottom: 2px;

    &::-webkit-scrollbar {
      height: 4px;
    }
  }

  &__quick-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    max-width: 220px;
    height: 32px;
    padding: 0 12px;
    border: 1px solid rgba(0, 0, 0, 0.12);
    border-radius: 6px;
    background: var(--coliopt-surface-muted);
    cursor: pointer;
    font-size: 12px;
    color: rgba(0, 0, 0, 0.75);
    transition: border-color 0.16s ease, background-color 0.16s ease, color 0.16s ease;

    &:hover:not(:disabled) {
      border-color: #a9c9df;
      background: var(--coliopt-primary-soft);
      color: var(--coliopt-primary-hover);
    }

    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &:disabled {
      opacity: 0.55;
      cursor: default;
    }
  }

  &__quick-chip-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }

  &__messages {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
  }

  &__new-chat-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 24px;
    border: none;
    background: transparent;
    color: var(--coliopt-primary-hover);
    font-size: 11px;
    cursor: pointer;
    padding: 0;

    &:disabled {
      color: #98a5b1;
      cursor: default;
    }
  }

  &__footer {
    flex-shrink: 0;
    padding: 10px 16px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-top: 1px solid rgba(0, 0, 0, 0.06);
    background: #fff;
  }

  &__attachment-status {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    min-height: 20px;
    color: #667482;
    font-size: 11px;
    line-height: 16px;
  }

  &__attachment-status-dot {
    flex-shrink: 0;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #9aa6b2;
  }

  &__attachment-status-text {
    min-width: 0;
    color: rgba(0, 0, 0, 0.72);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__attachment-status-detail {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__attachment-status.is-ready &__attachment-status-dot {
    background: #2e7d32;
  }

  &__attachment-status.is-uploading &__attachment-status-dot {
    background: #1a6bc3;
    animation: assistant-status-pulse 1.2s ease-in-out infinite;
  }

  &__attachment-status.is-error &__attachment-status-dot {
    background: #c62828;
  }

  &__attachment-status.is-disabled {
    opacity: 0.82;
  }

  &__welcome-hero {
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 0;
  }

  &__avatar {
    position: relative;
    flex-shrink: 0;
    width: 60px;
    height: 60px;
    object-fit: cover;
    pointer-events: none;
  }

  &__welcome-copy {
    min-width: 0;
  }

  &__greeting {
    min-width: 0;

    p {
      margin: 0;
      font-size: 20px;
      line-height: 32px;
      letter-spacing: 0.15px;
      color: rgba(0, 0, 0, 0.87);
    }
  }

  &__greeting-normal {
    font-family: Helvetica, Arial, sans-serif;
    font-weight: 400;
  }

  &__greeting-highlight {
    font-family: Inter, 'PingFang SC', sans-serif;
    font-weight: 500;
    color: #1a6bc3;
  }

  &__subtitle {
    margin-top: 2px;

    p {
      margin: 0;
      max-width: 360px;
      font-family: Helvetica, Arial, sans-serif;
      font-size: 14px;
      font-weight: 400;
      line-height: 20.02px;
      letter-spacing: 0.1499px;
      color: rgba(0, 0, 0, 0.6);
    }
  }

  &__presets {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  &__presets-title {
    color: rgba(0, 0, 0, 0.58);
    font-size: 11px;
    font-weight: 600;
    line-height: 16px;
  }

  &__preset-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 52px;
    padding: 14px 16px;
    box-sizing: border-box;
    border: 1px solid rgba(0, 0, 0, 0.12);
    border-radius: 8px;
    cursor: pointer;
    background: #fff;
    transition: border-color 0.2s ease, background-color 0.2s ease;

    &.is-active {
      border-color: #1a6bc3;
      background: #f7fbff;

      .assistant-dialog__preset-text {
        color: #1a6bc3;
      }
    }
  }

  &__preset-icon {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
  }

  &__preset-text {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-family: Inter, Helvetica, 'Noto Sans JP', 'PingFang SC', sans-serif;
    font-size: 14px;
    font-weight: 400;
    line-height: 20.02px;
    letter-spacing: 0.1499px;
    color: rgba(0, 0, 0, 0.87);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__preset-arrow {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
  }

  &__input-box {
    position: relative;
    width: 100%;
    border: 1px solid #c9d6e1;
    border-radius: 8px;
    box-sizing: border-box;
    overflow: hidden;
    background: #fff;
    transition: border-color 0.16s ease, box-shadow 0.16s ease;

    &:focus-within {
      border-color: var(--coliopt-primary);
      box-shadow: 0 0 0 2px rgba(22, 119, 200, 0.1);
    }

    &--default {
      height: 72px;
    }

    &--expanded {
      height: 120px;
    }
  }

  &__attachment-list {
    position: absolute;
    left: 9px;
    right: 9px;
    top: 9px;
    display: flex;
    gap: 7px;
    height: 44px;
    padding: 1px 2px 3px;
    overflow-x: auto;
    overflow-y: hidden;
    z-index: 2;
  }

  &__attachment-chip {
    position: relative;
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: 28px minmax(55px, 1fr) auto 16px;
    align-items: center;
    gap: 5px;
    min-width: 145px;
    max-width: 230px;
    height: 36px;
    padding: 3px 5px;
    border: 1px solid #dbe5ee;
    border-radius: 5px;
    background: #f7f9fb;
    box-sizing: border-box;

    &.is-error {
      border-color: #e4b8bd;
      background: #fff7f7;
    }

    &.is-uploading {
      border-color: #b7d0e9;
      background: #f5faff;
    }
  }

  &__attachment-file-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 3px;
    background: #e8eef5;
    color: #52687d;
    font-size: 8px;
    font-weight: 700;
  }

  &__attachment-thumb {
    display: block;
    width: 28px;
    height: 28px;
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 3px;
    object-fit: cover;
    background: #f5f8fc;
    box-sizing: border-box;
  }

  &__attachment-name {
    min-width: 0;
    font-size: 10px;
    color: rgba(0, 0, 0, 0.75);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__attachment-state {
    color: #387047;
    font-size: 9px;
    white-space: nowrap;
  }

  &__attachment-chip.is-error &__attachment-state {
    color: #b42323;
  }

  &__attachment-chip.is-uploading &__attachment-state {
    color: #1a6bc3;
  }

  &__attachment-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: #dfe6ed;
    cursor: pointer;
    box-sizing: border-box;

    img {
      display: block;
      width: 9px;
      height: 9px;
    }

    &:hover {
      background: #cbd5df;
    }
  }

  &__input-btn {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 5px;
    border: none;
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
    box-sizing: border-box;
    transition: background-color 0.16s ease, opacity 0.16s ease;

    img {
      display: block;
      width: 20px;
      height: 20px;
    }

    &--attach {
      left: 10px;
      top: auto;
      bottom: 8px;

      &:hover:not(:disabled) {
        background: #edf2f6;
      }

      &.is-disabled {
        cursor: not-allowed;
        opacity: 0.42;
        filter: grayscale(1);
      }

      &.is-expanded {
        top: auto;
      }
    }

    &--send {
      right: 10px;
      left: auto;
      top: auto;
      bottom: 8px;
      transform: none;

      &.is-expanded {
        top: auto;
        bottom: 8px;
        transform: none;
      }

      &.is-active {
        width: 32px;
        height: 32px;
        padding: 0;
        border-radius: 6px;
        background: var(--coliopt-primary);
        box-shadow: 0 2px 6px rgba(26, 107, 195, 0.3);
        cursor: pointer;

        img {
          width: 18px;
          height: 18px;
        }

        &:hover:not(:disabled) {
          background: var(--coliopt-primary-hover);
        }
      }

      &.is-stop {
        background: #b42323;
        box-shadow: 0 2px 6px rgba(180, 35, 35, 0.24);

        &:hover {
          background: #932020;
        }
      }

      &:disabled {
        cursor: default;

        &.is-active {
          opacity: 0.65;
        }
      }
    }
  }

  &__stop-icon {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    background: #fff;
  }

  &__composer-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 28px;
  }

  &__input-field {
    position: absolute;
    left: 14px;
    right: 52px;
    top: 10px;
    width: auto;
    height: 38px;
    border: none;
    outline: none;
    padding: 0;
    margin: 0;
    background: transparent;
    resize: none;
    overflow-y: auto;
    font-family: Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif;
    font-size: 14px;
    font-weight: 400;
    line-height: 20px;
    letter-spacing: 0;
    color: rgba(51, 51, 51, 0.87);

    &::placeholder {
      color: #6f7d89;
    }

    &.is-expanded {
      top: 58px;
    }

    &:read-only {
      cursor: default;
    }
  }

  &__file-input {
    display: none;
  }

  &__model-menu {
    position: relative;
    align-self: flex-start;
    width: 124px;
    z-index: 5;
  }

  &__model-select {
    position: relative;
    width: 124px;
    height: 28px;
    border: 1px solid #d3dee7;
    padding: 0;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
    align-self: flex-start;
    transition: border-color 0.16s ease, background-color 0.16s ease;

    &:hover:not(:disabled),
    &.is-open {
      border-color: #9fc5df;
      background: var(--coliopt-primary-soft);
    }

    &:disabled {
      cursor: default;
      opacity: 0.62;
    }

    &.is-open .assistant-dialog__model-chevron {
      transform: rotate(180deg);
    }
  }

  &__model-select-inner {
    display: flex;
    align-items: center;
    width: 124px;
    height: 28px;
    padding: 4px 30px 4px 12px;
    box-sizing: border-box;
    border-radius: 4px;
  }

  &__model-label {
    position: relative;
    height: 20.125px;
    padding-left: 10px;
    max-width: 76px;

    p {
      margin: 0;
      font-family: Inter, 'PingFang SC', sans-serif;
      font-size: 12px;
      font-weight: 600;
      line-height: 20.125px;
      letter-spacing: 0.1313px;
      color: rgba(0, 0, 0, 0.87);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  &__model-dot {
    position: absolute;
    left: -10px;
    top: 7.062px;
    width: 6px;
    height: 6px;
    border-radius: 3px;
    background: #1976d2;
  }

  &__model-chevron {
    position: absolute;
    left: auto;
    right: 4px;
    top: 2px;
    width: 24px;
    height: 24px;
    transition: transform 0.16s ease;
  }

  &__model-options {
    position: fixed;
    width: 184px;
    padding: 6px;
    border: 1px solid #dfe8f2;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);
    box-sizing: border-box;
    z-index: 6;
  }

  &__model-option {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    padding: 8px 9px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: rgba(0, 0, 0, 0.76);
    text-align: left;
    cursor: pointer;

    &:hover,
    &.is-selected {
      background: #f0f6ff;
    }

    &.is-selected {
      color: #1a6bc3;
    }
  }

  &__model-option-title {
    font-size: 13px;
    font-weight: 600;
    line-height: 18px;
  }

  &__model-option-desc {
    color: #667482;
    font-size: 11px;
    line-height: 15px;
  }

  &__disclaimer {
    min-width: 0;
    text-align: right;

    p {
      margin: 0;
      font-family: Helvetica, Arial, sans-serif;
      font-size: 10px;
      font-weight: 400;
      line-height: 19.92px;
      letter-spacing: 0;
      color: #788692;
      white-space: nowrap;
    }
  }
}

.chat-message {
  width: 96%;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 12px 14px;
  box-sizing: border-box;
  background: #fff;

  &--user {
    width: auto;
    max-width: 86%;
    align-self: flex-end;
    margin-left: auto;
    background: #e9f8f5;
    border-color: #bce3dc;
  }

  &--agent {
    align-self: flex-start;
    margin-right: auto;
  }

  &--streaming {
    border-color: rgba(26, 107, 195, 0.28);
    box-shadow: 0 0 0 1px rgba(26, 107, 195, 0.06);
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 8px;
    color: rgba(0, 0, 0, 0.55);
    font-size: 12px;
    font-weight: 600;
  }

  &__label {
    color: rgba(0, 0, 0, 0.72);
  }

  &__meta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: 400;
    color: rgba(0, 0, 0, 0.45);
  }

  &__copy-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: #1a6bc3;
    font-size: 13px;
    cursor: pointer;
    padding: 0;

    &:hover {
      background: #edf3f8;
    }
  }

  &__status {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    font-size: 12px;
    color: rgba(0, 0, 0, 0.72);

    &--ok {
      color: #2e7d32;
    }

    &--warning {
      color: #b7791f;
    }

    &--error {
      color: #c62828;
    }

    &--pending {
      color: #1a6bc3;
    }
  }

  &__status-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    font-size: 11px;
    font-weight: 700;

    &--spin {
      animation: assistant-stream-spin 1.2s linear infinite;
    }
  }

  &__warning {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 8px;
    padding: 8px 10px;
    border: 1px solid #ead39d;
    border-radius: 6px;
    background: #fff8e8;
    color: #8a6d1f;
    font-size: 12px;
    line-height: 1.45;
  }

  &__warning-icon {
    flex-shrink: 0;
    line-height: 1.2;
  }

  &__approval-card {
    margin: 0 0 10px;
    padding: 10px 12px;
    border: 1px solid #ead39d;
    border-radius: 8px;
    background: #fff8e8;
    color: #7a5b14;
    font-size: 12px;
    line-height: 1.5;

    p {
      margin: 4px 0 0;
    }

    &--danger {
      border-color: #f0b8b8;
      background: #fff1f1;
      color: #9f1d1d;
    }

    &--approval {
      border-color: #f2c078;
      background: #fff7ec;
      color: #8a4c08;
    }
  }

  &__approval-card-title {
    color: rgba(0, 0, 0, 0.82);
    font-weight: 600;
  }

  &__approval-card-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;

    span {
      display: inline-flex;
      align-items: center;
      min-height: 20px;
      padding: 2px 7px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.68);
      color: currentColor;
      font-size: 11px;
      line-height: 14px;
    }
  }

  &__evidence-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    margin-bottom: 8px;
    padding: 0;
    border: none;
    background: transparent;
    color: rgba(0, 0, 0, 0.55);
    font-size: 12px;
    cursor: pointer;
    text-align: left;
  }

  &__evidence-arrow {
    display: inline-block;
    transition: transform 0.2s ease;
    font-size: 14px;
    line-height: 1;

    &.is-open {
      transform: rotate(90deg);
    }
  }

  &__evidence-list {
    margin: 0 0 8px;
    padding-left: 18px;
    font-size: 12px;
    line-height: 1.5;
    color: rgba(0, 0, 0, 0.55);
    font-style: italic;
  }

  &__next-actions {
    margin: 10px 0 8px;
    padding: 9px 10px;
    border: 1px solid #dfe8f2;
    border-radius: 8px;
    background: #fbfcfe;
    font-size: 12px;
    color: rgba(0, 0, 0, 0.72);

    ul {
      margin: 6px 0 0;
      padding-left: 18px;
      line-height: 1.5;
    }
  }

  &__section-label {
    color: rgba(0, 0, 0, 0.62);
    font-size: 11px;
    font-weight: 600;
  }

  &__trace {
    margin: 8px 0 0;
    padding-top: 6px;
    border-top: 1px solid #edf1f5;
    color: rgba(0, 0, 0, 0.6);
    font-size: 12px;

    summary {
      cursor: pointer;
      color: #526170;
      line-height: 1.5;
    }

    ul {
      margin: 6px 0 0;
      padding-left: 16px;
      line-height: 1.55;
    }

    li + li {
      margin-top: 4px;
    }
  }

  &__trace-name {
    color: rgba(0, 0, 0, 0.76);
    font-weight: 600;
  }

  &__trace-status {
    margin-left: 6px;
    color: #1a6bc3;
  }

  &__trace-summary {
    display: block;
    margin-top: 2px;
  }

  &__stream-detail {
    margin: 0 0 8px;
    font-size: 12px;
    line-height: 1.45;
    color: rgba(0, 0, 0, 0.55);
  }

  &__stream-steps {
    margin: 0 0 8px;
    padding-left: 18px;
    font-size: 11px;
    line-height: 1.5;
    color: rgba(26, 107, 195, 0.85);
  }

  &__footer-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  &__attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 8px;

    span {
      max-width: 100%;
      padding: 3px 7px;
      border: 1px solid #a9d7cf;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.7);
      color: #315e58;
      font-size: 10px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__body {
    font-size: 14px;
    line-height: 1.58;
    color: rgba(0, 0, 0, 0.87);
    overflow-wrap: anywhere;
    word-break: break-word;

    &--preview {
      opacity: 0.92;
    }

    ::v-deep p {
      margin: 0 0 8px;

      &:last-child {
        margin-bottom: 0;
      }
    }

    ::v-deep ul {
      margin: 0 0 8px;
      padding-left: 20px;
    }

    ::v-deep ol {
      margin: 0 0 8px;
      padding-left: 20px;
    }

    ::v-deep li {
      margin-bottom: 6px;

      &:last-child {
        margin-bottom: 0;
      }
    }

    ::v-deep h2 {
      margin: 12px 0 7px;
      font-size: 15px;
      font-weight: 600;
      line-height: 1.35;
    }

    ::v-deep h3 {
      margin: 10px 0 6px;
      font-size: 14px;
      font-weight: 600;
    }

    ::v-deep h4 {
      margin: 8px 0 5px;
      font-size: 13px;
      font-weight: 600;
    }

    ::v-deep strong {
      font-weight: 600;
      color: rgba(0, 0, 0, 0.92);
    }

    ::v-deep em {
      color: rgba(0, 0, 0, 0.72);
    }

    ::v-deep a {
      color: #1a6bc3;
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }

    ::v-deep pre {
      max-width: 100%;
      margin: 8px 0;
      padding: 10px;
      overflow-x: auto;
      border-radius: 6px;
      background: #17212b;
      color: #edf4fb;
      font-size: 12px;
      line-height: 1.5;
    }

    ::v-deep code {
      font-family: Consolas, 'Liberation Mono', monospace;
    }

    ::v-deep .inline-code {
      padding: 1px 4px;
      border-radius: 4px;
      background: #eef3f8;
      color: #243447;
      font-size: 12px;
    }

    ::v-deep blockquote {
      margin: 8px 0;
      padding: 7px 10px;
      border: 1px solid #dfe8f2;
      border-radius: 6px;
      background: #f8fbff;
      color: rgba(0, 0, 0, 0.68);
    }

    ::v-deep .chat-message__execution-plan {
      margin: 8px 0;
      border: 1px solid #dfe8f2;
      border-radius: 8px;
      background: #fbfcfe;
      overflow: hidden;
    }

    ::v-deep .chat-message__execution-plan summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 9px 10px;
      color: rgba(0, 0, 0, 0.72);
      font-size: 12px;
      font-weight: 600;
      line-height: 1.45;
      cursor: pointer;
      user-select: none;
      list-style: none;
    }

    ::v-deep .chat-message__execution-plan summary::-webkit-details-marker {
      display: none;
    }

    ::v-deep .chat-message__execution-plan-title {
      color: rgba(0, 0, 0, 0.84);
      font-weight: 700;
    }

    ::v-deep .chat-message__execution-plan-meta {
      flex-shrink: 0;
      min-height: 20px;
      padding: 2px 7px;
      border-radius: 999px;
      background: #eef4fa;
      color: #1a6bc3;
      font-size: 11px;
      font-weight: 700;
      line-height: 14px;
      white-space: nowrap;
    }

    ::v-deep .chat-message__execution-plan-body {
      border-top: 1px solid #edf1f5;
      padding: 8px 10px 10px;
    }

    ::v-deep hr {
      height: 1px;
      margin: 10px 0;
      border: none;
      background: #e7edf3;
    }

    ::v-deep .table-wrapper {
      max-width: 100%;
      margin: 8px 0;
      overflow-x: auto;
    }

    ::v-deep table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      line-height: 1.45;
      white-space: nowrap;
    }

    ::v-deep th,
    ::v-deep td {
      padding: 6px 8px;
      border: 1px solid #e2e8f0;
      text-align: left;
    }

    ::v-deep th {
      background: #f3f6fa;
      color: rgba(0, 0, 0, 0.74);
      font-weight: 600;
    }
  }

  &__approval {
    margin: 8px 0 0;
    font-size: 12px;
    color: #e65100;
    line-height: 1.4;
  }
}

.report-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}

.file-tag {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 340px;
  padding: 8px 14px;
  border: 1px solid #e2e5ea;
  border-radius: 8px;
  background: #eef2f6;
  color: inherit;
  font: inherit;
  cursor: pointer;
  user-select: none;
  outline: none;
  appearance: none;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, border-color 0.15s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    border-color: #d0d5dd;
    background: #fff;
  }

  &:active {
    transform: translateY(0);
  }
}

.file-tag-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
}

.file-tag-name {
  min-width: 0;
  overflow: hidden;
  color: #374151;
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-tag-badge {
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.06);
  color: #52525b;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.file-tag-pdf .file-tag-badge {
  background: #fef2f2;
  color: #dc2626;
}

.file-tag-docx .file-tag-badge {
  background: #eff6ff;
  color: #2563eb;
}

.assistant-chart-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 10px 0;

  &__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
  }

  &__label {
    min-width: 0;
    color: #526170;
    font-size: 12px;
    font-weight: 600;
    line-height: 24px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__actions {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 6px;
  }

  &__action {
    min-height: 24px;
    padding: 3px 8px;
    border: 1px solid #d8e2ec;
    border-radius: 6px;
    background: #fff;
    color: #315e58;
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    line-height: 16px;
    cursor: pointer;
    transition: border-color 0.16s ease, background-color 0.16s ease, color 0.16s ease;

    &:hover:not(:disabled) {
      border-color: #a9d7cf;
      background: #f4fbf9;
      color: #0f766e;
    }

    &:disabled {
      cursor: default;
      opacity: 0.48;
    }
  }
}

.assistant-chart {
  width: 100%;
  min-width: 0;
  border: 1px solid #dfe8f2;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;

  &__head {
    padding: 0;
    background: #f8fbff;
    border-bottom: 1px solid #edf2f7;
  }

  &__head-toggle {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    min-width: 0;
    padding: 9px 10px 6px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  &__head-copy {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
  }

  &__title {
    display: block;
    color: rgba(0, 0, 0, 0.84);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  &__subtitle {
    display: block;
    margin-top: 2px;
    color: #667482;
    font-size: 11px;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  &__toggle {
    flex: 0 0 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    margin-top: -2px;
    border-radius: 6px;
    color: #667482;
    transition: background-color 0.16s ease, color 0.16s ease;

    i {
      font-size: 13px;
      transition: transform 0.18s ease;

      &.is-collapsed {
        transform: rotate(-90deg);
      }
    }
  }

  &__head-toggle:hover &__toggle {
    background: #edf3f8;
    color: #0f766e;
  }

  &__summary {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 7px;
  }

  &__pill {
    display: inline-flex;
    align-items: center;
    min-height: 20px;
    padding: 2px 7px;
    border-radius: 999px;
    background: #edf3f8;
    color: #526170;
    font-size: 11px;
    line-height: 14px;

    &--up {
      background: #eef9f2;
      color: #236b3b;
    }

    &--down {
      background: #fff1f1;
      color: #b42323;
    }
  }

  &__body {
    width: 100%;
    min-height: 240px;
    background: #ffffff;
  }

  &.is-collapsed &__head {
    border-bottom-color: transparent;
  }
}

/*
 * Enerlution EMS3.0 Agent visual system
 *
 * This layer deliberately changes presentation only. The existing DOM,
 * events, request flow, and test selectors remain untouched.
 */
.assistant-dialog {
  --coliopt-primary: #1677c8;
  --coliopt-primary-hover: #0f66ad;
  --coliopt-primary-soft: #edf6fc;
  --coliopt-ink: #18242d;
  --coliopt-muted: #596a76;
  --coliopt-subtle: #74838e;
  --coliopt-border: #d9e1e6;
  --coliopt-border-strong: #c6d1d8;
  --coliopt-surface: #ffffff;
  --coliopt-surface-muted: #f5f7f8;
  --coliopt-surface-raised: #fafbfc;
  --coliopt-success: #287d4b;
  --coliopt-warning: #956500;
  --coliopt-danger: #b42318;
  border-radius: 0;
  background: var(--coliopt-surface);
  box-shadow: -8px 0 24px rgba(24, 36, 45, 0.14);
  color: var(--coliopt-ink);
  font-family: Inter, 'Segoe UI', 'Noto Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  transition: none;

  button,
  input,
  textarea {
    font: inherit;
  }

  button {
    -webkit-tap-highlight-color: transparent;
  }

  button:focus-visible,
  input:focus-visible,
  textarea:focus-visible,
  summary:focus-visible {
    outline: 2px solid rgba(22, 119, 200, 0.48);
    outline-offset: 2px;
  }

  &__header {
    height: 62px;
    border-bottom-color: var(--coliopt-border);
  }

  &__header-inner {
    padding: 9px 14px 9px 18px;
  }

  &__header-brand {
    gap: 10px;
  }

  &__header-avatar {
    width: 28px;
    height: 28px;
  }

  &__header-title {
    p {
      font-family: inherit;
      font-size: 13px;
      font-weight: 650;
      line-height: 16px;
      white-space: normal;
      overflow: visible;
      text-overflow: clip;
    }

    span {
      display: none;
    }
  }

  &__header-actions {
    gap: 2px;
    height: 34px;
  }

  &__system-btn,
  &__history-btn {
    height: 32px;
    border-color: transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--coliopt-muted);
    font-size: 11px;
    transition: background-color 0.16s cubic-bezier(0.22, 1, 0.36, 1), color 0.16s ease;

    &:hover,
    &.is-active {
      border-color: transparent;
      background: var(--coliopt-surface-muted);
      color: var(--coliopt-primary-hover);
    }
  }

  &__system-btn.is-ready &__system-dot {
    background: var(--coliopt-success);
    box-shadow: 0 0 0 3px rgba(40, 125, 75, 0.11);
  }

  &__header-btn,
  &__close-btn {
    width: 34px;
    height: 34px;
    border-radius: 6px;
    transition: background-color 0.16s ease, color 0.16s ease;

    &:hover {
      background: var(--coliopt-surface-muted);
    }
  }

  &__context {
    border-bottom-color: var(--coliopt-border);
    background: var(--coliopt-surface-raised);
  }

  &__context-summary {
    min-height: 44px;
    gap: 12px;
    padding: 7px 16px 7px 18px;
    color: var(--coliopt-muted);
    font-size: 11px;
    transition: background-color 0.16s ease;

    &:hover {
      background: var(--coliopt-surface-muted);
    }

    strong {
      color: var(--coliopt-ink);
      font-size: 11px;
    }
  }

  &__context-summary-item:nth-of-type(3) {
    display: none;
  }

  &__context-controls {
    gap: 12px;
    padding: 16px 18px 18px;
    border-top-color: var(--coliopt-border);
    background: var(--coliopt-surface);
  }

  &__context-field {
    gap: 6px;

    > span {
      color: var(--coliopt-muted);
      font-size: 11px;
      line-height: 16px;
    }

    > input {
      height: 36px;
      padding: 0 10px;
      border-color: var(--coliopt-border-strong);
      border-radius: 6px;
      color: var(--coliopt-ink);
      font-size: 12px;

      &:hover {
        border-color: #9fb3c0;
      }
    }

    ::v-deep .el-input__inner {
      height: 36px;
      border-color: var(--coliopt-border-strong);
      border-radius: 6px;
      color: var(--coliopt-ink);
      font-size: 12px;
      line-height: 36px;
    }
  }

  &__content {
    background: var(--coliopt-surface);
  }

  &__system-panel,
  &__history-panel {
    inset: 0;
    border: 0;
    border-radius: 0;
    background: var(--coliopt-surface);
    box-shadow: none;
  }

  &__system-head,
  &__history-head {
    padding: 16px 18px 13px;
    border-bottom-color: var(--coliopt-border);
    background: var(--coliopt-surface-raised);
  }

  &__system-tools,
  &__history-list {
    padding: 8px 18px 18px;
  }

  &__history-item {
    padding: 10px 2px;
    border: 0;
    border-bottom: 1px solid var(--coliopt-border);
    border-radius: 0;

    &.is-active {
      border-color: var(--coliopt-border);
      background: var(--coliopt-primary-soft);
    }
  }

  &__welcome {
    gap: 28px;
    padding: 44px 28px 28px;
  }

  &__welcome-hero {
    gap: 14px;
  }

  &__avatar {
    width: 44px;
    height: 44px;
  }

  &__greeting p {
    color: var(--coliopt-ink);
    font-size: 19px;
    line-height: 27px;
    letter-spacing: 0;
  }

  &__greeting-normal,
  &__greeting-highlight,
  &__subtitle p,
  &__preset-text,
  &__input-field,
  &__model-label p,
  &__disclaimer p {
    font-family: inherit;
    letter-spacing: 0;
  }

  &__greeting-highlight {
    color: var(--coliopt-primary-hover);
    font-weight: 600;
  }

  &__subtitle p {
    color: var(--coliopt-muted);
    font-size: 13px;
    line-height: 20px;
  }

  &__presets {
    gap: 0;
  }

  &__presets-title {
    padding: 0 2px 10px;
    color: var(--coliopt-muted);
    font-size: 11px;
  }

  &__preset-item {
    min-height: 56px;
    gap: 12px;
    padding: 13px 10px;
    border: 0;
    border-top: 1px solid var(--coliopt-border);
    border-radius: 0;
    background: transparent;
    transition: background-color 0.16s ease, color 0.16s ease;

    &:last-child {
      border-bottom: 1px solid var(--coliopt-border);
    }

    &:hover,
    &.is-active {
      border-color: var(--coliopt-border);
      background: var(--coliopt-surface-muted);
    }
  }

  &__preset-icon,
  &__preset-arrow {
    width: 18px;
    height: 18px;
  }

  &__preset-text {
    color: var(--coliopt-ink);
    font-size: 13px;
    line-height: 20px;
  }

  &__chat-body {
    gap: 16px;
    padding: 16px 20px 24px;
    scroll-padding-bottom: 24px;
  }

  &__quick-row {
    gap: 6px;
  }

  &__quick-chip {
    height: 34px;
    border-color: var(--coliopt-border);
    border-radius: 6px;
    background: var(--coliopt-surface-raised);
    color: var(--coliopt-muted);

    &:hover:not(:disabled) {
      border-color: #9fc5df;
      background: var(--coliopt-primary-soft);
      color: var(--coliopt-primary-hover);
    }
  }

  &__messages {
    gap: 24px;
  }

  &__footer {
    gap: 10px;
    padding: 12px 16px 14px;
    border-top-color: var(--coliopt-border);
    background: var(--coliopt-surface);
  }

  &__composer-toolbar {
    min-height: 32px;
  }

  &__model-menu {
    position: relative;
    grid-area: mode;
    align-self: center;
    justify-self: end;
    width: 120px;
    z-index: 5;
  }

  &__model-select,
  &__model-select-inner {
    width: 120px;
  }

  &__model-select,
  &__model-select-inner {
    height: 36px;
  }

  &__model-select {
    border-color: var(--coliopt-border-strong);
    border-radius: 8px;
    background: var(--coliopt-surface);
    transition:
      border-color 0.18s ease,
      background-color 0.18s ease,
      box-shadow 0.18s ease;

    &:hover:not(:disabled) {
      border-color: #9eb7c7;
      background: #f8fbfd;
    }

    &.is-open {
      border-color: #8ab5d5;
      background: var(--coliopt-primary-soft);
      box-shadow: 0 0 0 2px rgba(22, 119, 200, 0.08);
    }

  }

  &__model-select-inner {
    padding: 4px 28px 4px 8px;
    border-radius: 8px;
  }

  &__model-label {
    position: static;
    display: flex;
    align-items: center;
    gap: 7px;
    height: 20px;
    max-width: 84px;
    padding-left: 0;

    p {
      color: var(--coliopt-ink);
      line-height: 20px;
      transition: color 0.18s ease;
    }
  }

  &__model-icon {
    position: static;
    flex: 0 0 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 5px;
    background: var(--coliopt-primary-soft);
    color: var(--coliopt-primary-hover);
    font-size: 12px;
    line-height: 1;
    transition:
      transform 0.18s cubic-bezier(0.22, 1, 0.36, 1),
      background-color 0.18s ease,
      color 0.18s ease;
  }

  &__model-select:hover:not(:disabled) &__model-icon,
  &__model-select.is-open &__model-icon {
    background: #dceefa;
    color: #0b5f9d;
    transform: translateY(-1px);
  }

  &__model-select:active:not(:disabled) &__model-icon {
    transform: scale(0.96);
  }

  &__model-chevron {
    right: 6px;
    top: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    color: #60717d;
    font-size: 12px;
    line-height: 1;
    transform: translateY(-50%);
    transform-origin: center;
    transition:
      transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
      color 0.18s ease;
  }

  &__model-select.is-open &__model-chevron {
    color: var(--coliopt-primary-hover);
    transform: translateY(-50%) rotate(180deg);
  }

  &__model-options {
    transform-origin: right bottom;
  }

  &__model-option {
    position: relative;
    padding-right: 32px;
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  &__model-option-check {
    position: absolute;
    right: 10px;
    top: 50%;
    color: var(--coliopt-primary-hover);
    font-size: 14px;
    transform: translateY(-50%);
  }

  &__input-box {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) 120px 40px;
    gap: 4px 8px;
    align-items: center;
    padding: 8px 10px;
    border-color: var(--coliopt-border-strong);
    border-radius: 10px;
    background: var(--coliopt-surface-raised);

    &:hover {
      border-color: #a9bac5;
    }

    &:focus-within {
      border-color: var(--coliopt-primary);
      box-shadow: 0 0 0 3px rgba(22, 119, 200, 0.1);
    }

    &--default {
      grid-template-areas:
        'field field field field'
        'attach . mode send';
      grid-template-rows: 40px 40px;
      height: auto;
      min-height: 100px;
    }

    &--expanded {
      grid-template-areas:
        'attachments attachments attachments attachments'
        'field field field field'
        'attach . mode send';
      grid-template-rows: 48px 40px 40px;
      height: auto;
      min-height: 152px;
    }
  }

  &__attachment-list {
    position: static;
    grid-area: attachments;
    align-self: stretch;
    width: 100%;
    height: 48px;
    padding: 4px 2px;
    box-sizing: border-box;
    z-index: auto;
  }

  &__attachment-chip {
    grid-template-columns: 30px minmax(60px, 1fr) auto 20px;
    gap: 6px;
    min-width: 170px;
    max-width: 260px;
    height: 40px;
    padding: 4px 6px;
  }

  &__attachment-file-icon,
  &__attachment-thumb {
    width: 30px;
    height: 30px;
  }

  &__attachment-name {
    font-size: 11px;
  }

  &__attachment-state {
    font-size: 10px;
  }

  &__attachment-remove {
    flex: 0 0 20px;
    width: 20px;
    height: 20px;

    img {
      width: 10px;
      height: 10px;
      overflow: hidden;
      object-fit: contain;
    }
  }

  &__input-field {
    position: static;
    grid-area: field;
    align-self: stretch;
    width: 100%;
    height: 40px;
    min-height: 40px;
    padding: 0 2px;
    color: var(--coliopt-ink);
    font-size: 14px;
    line-height: 21px;
    box-sizing: border-box;

    &::placeholder {
      color: #687a86;
      opacity: 1;
    }

    &:focus-visible {
      outline: none;
    }

    &.is-expanded {
      position: static;
    }
  }

  &__input-btn {
    position: static;
    align-self: center;
    width: 36px;
    height: 36px;
    border-radius: 7px;

    > img {
      width: 18px;
      height: 18px;
      max-width: 18px;
      max-height: 18px;
      overflow: hidden;
      object-fit: contain;
    }

    &--attach {
      grid-area: attach;
      justify-self: start;

      &.is-expanded {
        position: static;
      }
    }

    &--send {
      grid-area: send;
      justify-self: end;

      &.is-expanded {
        position: static;
      }

      &.is-active {
        width: 36px;
        height: 36px;
        border-radius: 7px;
        box-shadow: 0 2px 6px rgba(15, 102, 173, 0.25);

        img {
          width: 18px;
          height: 18px;
        }
      }
    }
  }

  &__new-chat-btn {
    min-height: 32px;
    color: var(--coliopt-primary-hover);
    font-size: 12px;
  }

  &__disclaimer p {
    color: var(--coliopt-subtle);
    line-height: 16px;
  }
}

textarea.assistant-dialog__input-field:focus-visible {
  outline: none;
}

.assistant-model-menu-enter-active {
  will-change: opacity, transform;
  transition:
    opacity 0.2s ease,
    transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.assistant-model-menu-leave-active {
  will-change: opacity, transform;
  transition:
    opacity 0.14s ease,
    transform 0.14s cubic-bezier(0.22, 1, 0.36, 1);
}

.assistant-model-menu-enter,
.assistant-model-menu-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.98);
}

.chat-message {
  width: 100%;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;

  &--user {
    width: auto;
    max-width: 86%;
    padding: 10px 12px;
    border: 0;
    border-radius: 8px;
    background: #edf5fb;
  }

  &--agent {
    padding-bottom: 2px;
  }

  &--streaming {
    padding: 13px 14px;
    border: 1px solid var(--coliopt-border);
    border-radius: 8px;
    background: var(--coliopt-surface-raised);
    box-shadow: none;
  }

  &__header {
    margin-bottom: 9px;
    color: var(--coliopt-subtle);
    font-size: 11px;
  }

  &--agent &__label {
    color: var(--coliopt-primary-hover);
  }

  &__label {
    color: var(--coliopt-ink);
    font-weight: 600;
  }

  &__meta {
    color: var(--coliopt-subtle);
  }

  &__copy-btn {
    width: 30px;
    height: 30px;
    color: var(--coliopt-muted);

    &:hover {
      background: var(--coliopt-surface-muted);
      color: var(--coliopt-primary-hover);
    }
  }

  &__body {
    color: var(--coliopt-ink);
    font-size: 14px;
    line-height: 1.65;

    ::v-deep p {
      margin-bottom: 10px;
    }

    ::v-deep li {
      margin-bottom: 5px;
    }

    ::v-deep th {
      background: var(--coliopt-surface-muted);
    }
  }

  &__evidence-toggle,
  &__trace summary {
    color: var(--coliopt-muted);
  }

  &__trace {
    border-top-color: var(--coliopt-border);
  }

  &__next-actions {
    border-color: var(--coliopt-border);
    background: var(--coliopt-surface-raised);
  }
}

.file-tag {
  border-color: var(--coliopt-border);
  background: var(--coliopt-surface-muted);
  box-shadow: none;
  transition: border-color 0.16s ease, background-color 0.16s ease;

  &:hover {
    transform: none;
    border-color: var(--coliopt-border-strong);
    background: var(--coliopt-surface);
    box-shadow: none;
  }
}

.assistant-chart {
  border-color: var(--coliopt-border);
  border-radius: 8px;

  &__head {
    border-bottom-color: var(--coliopt-border);
    background: var(--coliopt-surface-raised);
  }
}

@media (max-width: 720px) {
  .assistant-dialog-fade-enter-active .assistant-dialog,
  .assistant-dialog-fade-leave-active .assistant-dialog,
  .assistant-dialog-fade-enter .assistant-dialog,
  .assistant-dialog-fade-leave-to .assistant-dialog {
    transform: none;
    transition: none;
  }

  .assistant-dialog {
    right: 0;
    width: 100vw !important;
    border-radius: 0;
    box-shadow: none;
    transition: none;

    &__header {
      height: 60px;
    }

    &__resize-handle {
      display: none;
    }

    &__header-inner {
      padding: 8px 10px 8px 14px;
    }

    &__header-avatar {
      width: 26px;
      height: 26px;
    }

    &__header-actions {
      height: 40px;
    }

    &__header-btn,
    &__close-btn,
    &__system-btn,
    &__history-btn {
      min-width: 40px;
      height: 40px;
      padding: 0 8px;
    }

    &__system-btn {
      justify-content: center;
      width: 40px;

      > span:last-child {
        display: none;
      }
    }

    &__context-controls {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px 10px;
      padding: 14px 12px 16px;
    }

    &__context-summary {
      min-height: 44px;
      padding: 7px 12px 7px 14px;
    }

    &__context-field {
      > span {
        font-size: 12px;
      }

      > input,
      ::v-deep .el-input__inner {
        height: 40px;
        font-size: 14px;
        line-height: 40px;
      }
    }

    &__context-summary-item:nth-of-type(2),
    &__context-summary-item:nth-of-type(3) {
      display: none;
    }

    &__context-field--wide {
      grid-column: span 2;
    }

    &__history-btn {
      max-width: 50px;

      span {
        display: none;
      }
    }

    &__history-panel {
      inset: 0;
    }

    &__history-item {
      flex-direction: column;
    }

    &__history-actions {
      width: 100%;
      flex-direction: row;
      justify-content: flex-end;
    }

    &__history-action {
      min-width: 64px;
    }

    &__welcome {
      gap: 24px;
      padding: 30px 18px 22px;
    }

    &__welcome-hero {
      align-items: center;
      gap: 12px;
    }

    &__avatar {
      width: 40px;
      height: 40px;
    }

    &__greeting p {
      font-size: 18px;
      line-height: 26px;
    }

    &__subtitle p {
      max-width: none;
      font-size: 14px;
      line-height: 20px;
    }

    &__preset-item {
      min-height: 60px;
      padding: 12px 8px;
    }

    &__preset-text {
      display: -webkit-box;
      overflow: hidden;
      font-size: 14px;
      line-height: 20px;
      white-space: normal;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    &__chat-body {
      gap: 14px;
      padding: 14px 14px 20px;
    }

    &__quick-chip {
      height: 38px;
      font-size: 13px;
    }

    &__footer {
      padding: 10px 12px calc(12px + env(safe-area-inset-bottom));
    }

    &__composer-toolbar {
      min-height: 36px;
    }

    &__model-menu,
    &__model-select,
    &__model-select-inner {
      width: 120px;
    }

    &__model-select,
    &__model-select-inner {
      height: 40px;
    }

    &__model-chevron {
      top: 50%;
    }

    &__input-box--default {
      grid-template-columns: 44px minmax(0, 1fr) 120px 44px;
      grid-template-rows: 40px 44px;
      height: auto;
      min-height: 104px;
    }

    &__input-box--expanded {
      grid-template-columns: 44px minmax(0, 1fr) 120px 44px;
      grid-template-rows: 48px 40px 44px;
      height: auto;
      min-height: 156px;
    }

    &__input-btn {
      width: 44px;
      height: 44px;

      &--attach {
        position: static;
      }

      &--send {
        position: static;

        &.is-expanded {
          position: static;
        }

        &.is-active {
          width: 44px;
          height: 44px;
        }
      }
    }

    &__input-field {
      position: static;
      width: 100%;
      font-size: 14px;
      line-height: 21px;
    }

    &__disclaimer p {
      display: none;
    }
  }

  .chat-message {
    width: 100%;

    &--user {
      width: auto;
      max-width: 92%;
    }

    &__body {
      font-size: 14px;
      line-height: 1.65;
    }

    &__copy-btn {
      width: 36px;
      height: 36px;
    }
  }

  .assistant-chart__body {
    min-height: 200px;
  }
}

@media (max-height: 680px) and (max-width: 720px) {
  .assistant-dialog {
    &__welcome {
      gap: 16px;
      padding-top: 20px;
    }

    &__preset-item {
      min-height: 52px;
      padding-top: 9px;
      padding-bottom: 9px;
    }
  }
}

@keyframes assistant-stream-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@keyframes assistant-status-pulse {
  0%,
  100% {
    opacity: 0.45;
    transform: scale(0.88);
  }

  50% {
    opacity: 1;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .assistant-dialog,
  .assistant-dialog *,
  .assistant-dialog-fade-enter-active,
  .assistant-dialog-fade-leave-active {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }

  .chat-message__status-icon--spin,
  .assistant-dialog__attachment-status.is-uploading .assistant-dialog__attachment-status-dot {
    animation: none;
  }
}

.assistant-dialog-fade-enter-active,
.assistant-dialog-fade-leave-active {
  transition: background-color 0.18s ease;

  .assistant-dialog {
    transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }
}

.assistant-dialog-fade-enter,
.assistant-dialog-fade-leave-to {
  opacity: 1;
  background: rgba(24, 36, 45, 0);

  .assistant-dialog {
    transform: translateX(18px);
  }
}

@media (max-width: 720px) {
  .assistant-dialog-fade-enter-active .assistant-dialog,
  .assistant-dialog-fade-leave-active .assistant-dialog,
  .assistant-dialog-fade-enter .assistant-dialog,
  .assistant-dialog-fade-leave-to .assistant-dialog {
    transform: none;
    transition: none;
  }
}
</style>

<style scoped lang="scss" src="./AssistantDialog.redesign.scss"></style>

<style lang="scss">
body.assistant-dialog-resizing {
  cursor: ew-resize;
  user-select: none;

  * {
    cursor: ew-resize !important;
  }
}

.coliopt-context-site-popper.el-select-dropdown {
  z-index: 10050 !important;
  margin-top: 7px !important;
  border: 1px solid #c9d3d9;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 16px 38px rgba(23, 35, 45, 0.18), 0 3px 9px rgba(23, 35, 45, 0.07);
  overflow: hidden;

  .el-scrollbar__wrap {
    max-height: 260px;
  }

  .el-select-dropdown__list {
    padding: 6px;
  }

  .el-select-dropdown__item {
    height: 48px;
    padding: 0;
    border-radius: 6px;
    color: #33434f;
    line-height: normal;

    &.hover,
    &:hover {
      background: #f2f6f8;
    }

    &.selected {
      background: #edf5fa;
      color: #0d568d;
      font-weight: 400;
    }
  }

  .el-select-dropdown__empty {
    margin: 0;
    padding: 18px 12px;
    color: #63737f;
    font-size: 12px;
  }

  .popper__arrow {
    display: none;
  }
}

.coliopt-context-site-option {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 20px;
  align-items: center;
  gap: 9px;
  width: 100%;
  height: 48px;
  padding: 5px 10px;
  box-sizing: border-box;

  > .el-icon-office-building {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: #edf3f6;
    color: #526b7a;
    font-size: 13px;
  }

  &__copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
  }

  &__name,
  small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__name {
    color: #263640;
    font-size: 12px;
    font-weight: 550;
    line-height: 16px;
  }

  small {
    color: #7b8993;
    font-size: 9px;
    line-height: 12px;
  }

  &__check {
    color: #1769a6;
    font-size: 14px;
    text-align: center;
  }
}
</style>
