'use strict';

class DemoChat {
    constructor() {
        this.conversationHistory = [];
        this.isGenerating = false;
        this.previousResponseId = null;
        this.isConfigured = false;
        this.config = {
            endpoint: '',
            apiKey: '',
            deployment: ''
        };

        this.elements = {
            chatMessages: document.getElementById('chat-messages'),
            userInput: document.getElementById('user-input'),
            sendBtn: document.getElementById('send-btn'),
            sendStatus: document.getElementById('send-status'),
            settingsBtn: document.getElementById('settings-btn'),
            newChatBtn: document.getElementById('new-chat-btn'),
            settingsModal: document.getElementById('settings-modal'),
            settingsCancel: document.getElementById('settings-cancel'),
            settingsSave: document.getElementById('settings-save'),
            foundryEndpoint: document.getElementById('foundry-endpoint'),
            foundryKey: document.getElementById('foundry-key'),
            foundryDeployment: document.getElementById('foundry-deployment'),
            settingsStatus: document.getElementById('settings-status')
        };

        this.initialize();
    }

    initialize() {
        this.loadConfig();
        this.setupEventListeners();
        this.elements.userInput.focus();
    }

    // ----------------------------------------------------------------
    // Config persistence (API key is NOT saved between sessions)
    // ----------------------------------------------------------------
    loadConfig() {
        try {
            const saved = localStorage.getItem('demoChatFoundryConfig');
            if (saved) {
                const parsed = JSON.parse(saved);
                this.config.endpoint = parsed.endpoint || '';
                this.config.deployment = parsed.deployment || '';
                // apiKey is never persisted
                this.elements.foundryEndpoint.value = this.config.endpoint;
                this.elements.foundryDeployment.value = this.config.deployment;
            }
        } catch (err) {
            console.warn('Failed to load saved config:', err);
        }
    }

    saveConfig() {
        const endpoint = this.elements.foundryEndpoint.value.trim();
        const deployment = this.elements.foundryDeployment.value.trim();
        const apiKey = this.elements.foundryKey.value.trim();
        const statusEl = this.elements.settingsStatus;

        // Validate required fields
        if (!endpoint || !deployment || !apiKey) {
            this.showSettingsStatus('Please fill in all fields.', 'error');
            return;
        }

        // Validate endpoint URL
        let baseEndpoint;
        try {
            const url = new URL(endpoint);
            if (url.protocol !== 'https:') {
                this.showSettingsStatus('Endpoint must use HTTPS.', 'error');
                return;
            }
            // Use the origin (scheme + host) as the base endpoint
            baseEndpoint = url.origin;
        } catch {
            this.showSettingsStatus('Please enter a valid endpoint URL.', 'error');
            return;
        }

        this.config.endpoint = baseEndpoint;
        this.config.deployment = deployment;
        this.config.apiKey = apiKey;
        this.isConfigured = true;

        // Persist non-sensitive fields only
        try {
            localStorage.setItem('demoChatFoundryConfig', JSON.stringify({
                endpoint: this.config.endpoint,
                deployment: this.config.deployment
            }));
        } catch (err) {
            console.warn('localStorage unavailable, settings will not persist:', err);
        }

        this.showSettingsStatus('Settings saved!', 'success');
        this.elements.settingsBtn.classList.add('configured');

        setTimeout(() => {
            this.hideSettingsModal();
        }, 1200);
    }

    showSettingsStatus(message, type) {
        const el = this.elements.settingsStatus;
        el.textContent = message;
        el.className = `settings-status ${type}`;
    }

    clearSettingsStatus() {
        const el = this.elements.settingsStatus;
        el.textContent = '';
        el.className = 'settings-status';
    }

    // ----------------------------------------------------------------
    // Modal management
    // ----------------------------------------------------------------
    showSettingsModal() {
        // Refresh displayed values (key is blank each session for security)
        this.elements.foundryEndpoint.value = this.config.endpoint;
        this.elements.foundryDeployment.value = this.config.deployment;
        this.elements.foundryKey.value = '';
        this.clearSettingsStatus();
        this.elements.settingsModal.style.display = 'flex';
        this.elements.foundryEndpoint.focus();
    }

    hideSettingsModal() {
        this.elements.settingsModal.style.display = 'none';
        this.elements.settingsBtn.focus();
    }

    // ----------------------------------------------------------------
    // Event listeners
    // ----------------------------------------------------------------
    setupEventListeners() {
        // Send on click
        this.elements.sendBtn.addEventListener('click', () => {
            if (this.isGenerating) {
                this.stopGeneration();
            } else {
                this.sendMessage();
            }
        });

        // Send on Enter (Shift+Enter = new line)
        this.elements.userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !this.isGenerating) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Auto-resize textarea
        this.elements.userInput.addEventListener('input', () => {
            this.autoResizeTextarea();
        });

        // Settings button
        this.elements.settingsBtn.addEventListener('click', () => {
            this.showSettingsModal();
        });

        // New chat button
        this.elements.newChatBtn.addEventListener('click', () => {
            this.startNewChat();
        });

        // Settings modal – Save
        this.elements.settingsSave.addEventListener('click', () => {
            this.saveConfig();
        });

        // Settings modal – Cancel
        this.elements.settingsCancel.addEventListener('click', () => {
            this.hideSettingsModal();
        });

        // Close settings modal on overlay click
        this.elements.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.elements.settingsModal ||
                e.target.classList.contains('modal-overlay')) {
                this.hideSettingsModal();
            }
        });

        // Save on Enter inside form fields
        [this.elements.foundryEndpoint, this.elements.foundryDeployment, this.elements.foundryKey]
            .forEach(field => {
                field.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.saveConfig();
                    }
                });
            });

        // Escape closes modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' &&
                this.elements.settingsModal.style.display === 'flex') {
                this.hideSettingsModal();
            }
        });

        // Keyboard shortcut: Ctrl/Cmd+K → focus input
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.elements.userInput.focus();
            }
        });
    }

    autoResizeTextarea() {
        const ta = this.elements.userInput;
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 150) + 'px';
    }

    // ----------------------------------------------------------------
    // Chat actions
    // ----------------------------------------------------------------
    startNewChat() {
        // Clear messages and reset state
        const messages = this.elements.chatMessages;
        messages.replaceChildren(this.buildWelcomeNode());
        this.conversationHistory = [];
        this.previousResponseId = null;
        this.elements.userInput.value = '';
        this.elements.userInput.style.height = 'auto';
        this.elements.userInput.focus();
    }

    buildWelcomeNode() {
        const wrap = document.createElement('div');
        wrap.className = 'welcome-message';
        wrap.setAttribute('role', 'article');
        wrap.setAttribute('aria-label', 'Welcome message');

        const avatar = document.createElement('div');
        avatar.className = 'avatar ai-avatar';
        avatar.setAttribute('aria-hidden', 'true');
        avatar.textContent = '🤖';

        const content = document.createElement('div');
        content.className = 'message-content';

        const author = document.createElement('p');
        author.className = 'message-author';
        author.textContent = 'Assistant';

        const body = document.createElement('p');
        body.appendChild(document.createTextNode(
            "Hi! I'm your AI assistant powered by Azure AI Foundry. Click "));
        const strong = document.createElement('strong');
        strong.textContent = '⚙️ Settings';
        body.appendChild(strong);
        body.appendChild(document.createTextNode(
            ' to configure your AI Foundry agent, then start chatting!'));

        content.appendChild(author);
        content.appendChild(body);
        wrap.appendChild(avatar);
        wrap.appendChild(content);
        return wrap;
    }

    async sendMessage() {
        const text = this.elements.userInput.value.trim();
        if (!text || this.isGenerating) return;

        // Clear input
        this.elements.userInput.value = '';
        this.elements.userInput.style.height = 'auto';

        // Add user message
        this.addMessage('user', text);

        if (!this.isConfigured) {
            const frag = document.createDocumentFragment();
            frag.appendChild(document.createTextNode('Please click ⚙️ '));
            const strong = document.createElement('strong');
            strong.textContent = 'Settings';
            frag.appendChild(strong);
            frag.appendChild(document.createTextNode(
                ' to configure your AI Foundry agent before chatting.'));
            this.addMessage('assistant', frag);
            this.elements.settingsBtn.focus();
            return;
        }

        // Disable input during generation
        this.setGeneratingState(true);

        // Add typing indicator
        const typingMsg = this.addTypingIndicator();

        try {
            const response = await this.callFoundryAPI(text);
            typingMsg.remove();
            this.addMessage('assistant', this.formatResponseToDom(response));

            // Track history
            this.conversationHistory.push(
                { role: 'user', content: text },
                { role: 'assistant', content: response }
            );
        } catch (err) {
            typingMsg.remove();
            console.error('Error calling Foundry API:', err);
            this.addMessage('assistant',
                `Sorry, I encountered an error: ${err.message}`, true);
        } finally {
            this.setGeneratingState(false);
            this.elements.userInput.focus();
        }
    }

    stopGeneration() {
        // Signal stop; the fetch is already in-flight so we just re-enable UI
        this.setGeneratingState(false);
    }

    setGeneratingState(generating) {
        this.isGenerating = generating;
        this.elements.userInput.disabled = generating;

        const icon = this.elements.sendBtn.querySelector('.send-icon');
        if (generating) {
            this.elements.sendBtn.title = 'Stop';
            this.elements.sendBtn.setAttribute('aria-label', 'Stop');
            if (icon) icon.textContent = '■';
            this.elements.sendStatus.textContent = 'Generating response…';
        } else {
            this.elements.sendBtn.title = 'Send message';
            this.elements.sendBtn.setAttribute('aria-label', 'Send message');
            if (icon) icon.textContent = '▶';
            this.elements.sendStatus.textContent = '';
        }
    }

    // ----------------------------------------------------------------
    // DOM helpers
    // ----------------------------------------------------------------

    /**
     * Add a message bubble to the chat.
     * @param {string} role  - 'user' or 'assistant'
     * @param {string|DocumentFragment|Element} content
     *   - string: rendered as plain text (safe, never interpreted as HTML)
     *   - DocumentFragment/Element: appended directly (must be built via DOM APIs)
     * @param {boolean} isError
     */
    addMessage(role, content, isError = false) {
        const div = document.createElement('div');
        div.className = `message ${role}-message${isError ? ' error-message' : ''}`;
        div.setAttribute('role', 'article');
        div.setAttribute('aria-label', `Message from ${role === 'user' ? 'you' : 'assistant'}`);

        const avatarDiv = document.createElement('div');
        avatarDiv.className = `avatar ${role === 'assistant' ? 'ai-avatar' : 'user-avatar'}`;
        avatarDiv.setAttribute('aria-hidden', 'true');
        avatarDiv.textContent = role === 'assistant' ? '🤖' : '👤';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        const authorEl = document.createElement('p');
        authorEl.className = 'message-author';
        authorEl.textContent = role === 'assistant' ? 'Assistant' : 'You';

        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';

        if (content instanceof DocumentFragment || content instanceof Element) {
            textDiv.appendChild(content);
        } else {
            // Plain text — textContent never interprets HTML, so this is XSS-safe.
            textDiv.textContent = String(content);
        }

        contentDiv.appendChild(authorEl);
        contentDiv.appendChild(textDiv);

        if (role === 'assistant') {
            div.appendChild(avatarDiv);
            div.appendChild(contentDiv);
        } else {
            div.appendChild(contentDiv);
            div.appendChild(avatarDiv);
        }

        this.elements.chatMessages.appendChild(div);
        this.scrollToBottom();
        return div;
    }

    addTypingIndicator() {
        const div = document.createElement('div');
        div.className = 'message assistant-message';
        div.setAttribute('role', 'status');
        div.setAttribute('aria-label', 'Assistant is typing');

        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'avatar ai-avatar';
        avatarDiv.setAttribute('aria-hidden', 'true');
        avatarDiv.textContent = '🤖';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        const authorEl = document.createElement('p');
        authorEl.className = 'message-author';
        authorEl.textContent = 'Assistant';

        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';

        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < 3; i++) {
            indicator.appendChild(document.createElement('span'));
        }

        textDiv.appendChild(indicator);
        contentDiv.appendChild(authorEl);
        contentDiv.appendChild(textDiv);
        div.appendChild(avatarDiv);
        div.appendChild(contentDiv);

        this.elements.chatMessages.appendChild(div);
        this.scrollToBottom();
        return div;
    }

    scrollToBottom() {
        const el = this.elements.chatMessages;
        el.scrollTop = el.scrollHeight;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Parse a URL string and return an <a> element, or null if the URL is invalid
     * or uses a non-http(s) scheme (guards against javascript: XSS).
     */
    buildLink(url, label) {
        try {
            const parsed = new URL(url);
            if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
                return null;
            }
        } catch {
            return null;
        }
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = label;
        return a;
    }

    /**
     * Convert API response text to a DocumentFragment using only DOM APIs.
     * No innerHTML is used, so there is no XSS risk regardless of the content.
     *
     * Supported formatting:
     *   - [label](url)   → <a> element
     *   - bare https?:// URLs preceded by whitespace / start-of-string → <a> element
     *   - double newlines → paragraph break
     *   - single newlines → <br>
     */
    formatResponseToDom(text) {
        const fragment = document.createDocumentFragment();

        // Split into paragraphs on two or more consecutive newlines
        const paragraphs = text.split(/\n{2,}/);

        for (const paraText of paragraphs) {
            const p = document.createElement('p');
            this.appendFormattedText(p, paraText);
            fragment.appendChild(p);
        }

        return fragment;
    }

    /**
     * Append formatted inline content (links, line breaks) to a parent element.
     * All text nodes are set via textContent, guaranteeing XSS safety.
     */
    appendFormattedText(parent, text) {
        // Combined regex: markdown links or bare URLs
        const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|((?:^|(?<=[\s(]))(https?:\/\/[^\s<)"]+))/g;

        let lastIndex = 0;
        let match;

        while ((match = linkPattern.exec(text)) !== null) {
            // Text before this match (may contain \n → <br>)
            if (match.index > lastIndex) {
                this.appendTextWithBreaks(parent, text.slice(lastIndex, match.index));
            }

            const isMarkdownLink = match[1] !== undefined;
            if (isMarkdownLink) {
                const label = match[1];
                const url = match[2];
                const a = this.buildLink(url, label);
                if (a) {
                    parent.appendChild(a);
                } else {
                    // Unsafe URL – render as plain text
                    parent.appendChild(document.createTextNode(`[${label}](${url})`));
                }
            } else {
                const url = match[3] || match[0];
                const a = this.buildLink(url, url);
                if (a) {
                    parent.appendChild(a);
                } else {
                    parent.appendChild(document.createTextNode(url));
                }
            }

            lastIndex = match.index + match[0].length;
        }

        // Remaining text after last match
        if (lastIndex < text.length) {
            this.appendTextWithBreaks(parent, text.slice(lastIndex));
        }
    }

    /** Split text on newlines and insert <br> elements between lines. */
    appendTextWithBreaks(parent, text) {
        const lines = text.split('\n');
        lines.forEach((line, idx) => {
            parent.appendChild(document.createTextNode(line));
            if (idx < lines.length - 1) {
                parent.appendChild(document.createElement('br'));
            }
        });
    }

    // ----------------------------------------------------------------
    // Azure AI Foundry API call
    // Uses the Responses API: POST {endpoint}/openai/v1/responses
    // ----------------------------------------------------------------
    async callFoundryAPI(userMessage) {
        const url = `${this.config.endpoint}/openai/v1/responses`;

        const body = {
            model: this.config.deployment,
            input: userMessage,
            store: true
        };

        // Chain conversation turns via previous_response_id
        if (this.previousResponseId) {
            body.previous_response_id = this.previousResponseId;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': this.config.apiKey
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        // Store response ID for conversation continuity
        if (data.id) {
            this.previousResponseId = data.id;
        }

        // Extract text from the response
        let text = '';

        if (Array.isArray(data.output)) {
            text = data.output
                .map(item => {
                    if (item.type === 'message' && Array.isArray(item.content)) {
                        return item.content.map(c => c.text || '').join('');
                    }
                    if (item.type === 'message' && typeof item.content === 'string') {
                        return item.content;
                    }
                    if (item.type === 'text') {
                        return item.text || '';
                    }
                    return '';
                })
                .join('');
        } else if (data.choices && data.choices[0]) {
            text = data.choices[0].message?.content || '';
        } else if (typeof data.output === 'string') {
            text = data.output;
        }

        if (!text) {
            throw new Error('No response text found in API response.');
        }

        return text;
    }
}

// Boot the app once the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new DemoChat();
});
