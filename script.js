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
        } catch {
            // Ignore parse errors
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
        } catch {
            // Storage might be unavailable
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
        messages.innerHTML = `
            <div class="welcome-message" role="article" aria-label="Welcome message">
                <div class="avatar ai-avatar" aria-hidden="true">🤖</div>
                <div class="message-content">
                    <p class="message-author">Assistant</p>
                    <p>Hi! I'm your AI assistant powered by Azure AI Foundry.<br>
                        Click <strong>⚙️ Settings</strong> to configure your AI Foundry agent, then start chatting!</p>
                </div>
            </div>`;
        this.conversationHistory = [];
        this.previousResponseId = null;
        this.elements.userInput.value = '';
        this.elements.userInput.style.height = 'auto';
        this.elements.userInput.focus();
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
            this.addMessage('assistant',
                'Please click ⚙️ <strong>Settings</strong> to configure your AI Foundry agent before chatting.');
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
            this.addMessage('assistant', this.formatResponse(response));

            // Track history
            this.conversationHistory.push(
                { role: 'user', content: text },
                { role: 'assistant', content: response }
            );
        } catch (err) {
            typingMsg.remove();
            console.error('Error calling Foundry API:', err);
            this.addMessage('assistant',
                `Sorry, I encountered an error: ${this.escapeHtml(err.message)}`, true);
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
    addMessage(role, htmlContent, isError = false) {
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

        if (role === 'assistant') {
            // htmlContent is pre-processed HTML from formatResponse() or a trusted
            // hardcoded string; all API-sourced text has been run through escapeHtml()
            // before any markup is added.
            textDiv.innerHTML = htmlContent;
        } else {
            textDiv.textContent = htmlContent;
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
        div.innerHTML = `
            <div class="avatar ai-avatar" aria-hidden="true">🤖</div>
            <div class="message-content">
                <p class="message-author">Assistant</p>
                <div class="message-text">
                    <div class="typing-indicator" aria-hidden="true">
                        <span></span><span></span><span></span>
                    </div>
                </div>
            </div>`;
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

    formatResponse(text) {
        // All API text is HTML-escaped first, so no injected markup can survive.
        const escaped = this.escapeHtml(text);

        // Convert markdown-style links [label](url) → <a>
        const withLinks = escaped.replace(
            /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
            '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
        );

        // Convert bare URLs that are NOT already inside an <a> tag.
        // After markdown link substitution above, replaced URLs appear as
        //   <a href="URL">label</a>  — the URL itself is preceded by href="
        // A bare URL is preceded by whitespace, '(' or start-of-string.
        const withBareLinks = withLinks.replace(
            /(^|[\s(])(https?:\/\/[^\s<)"]+)/g,
            '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>'
        );

        // Paragraphs separated by double newlines; single newlines → <br>
        return withBareLinks
            .split(/\n{2,}/)
            .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
            .join('');
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
