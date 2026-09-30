const socket = io();
const TOKEN_KEY = 'chatflow_token';

const state = {
  token: localStorage.getItem(TOKEN_KEY),
  users: [],
  conversations: [],
  groups: [],
  activePeople: [],
  activeConversationId: null,
  currentUserId: null,
  currentUser: null,
  avatarDraft: undefined,
  typingByUser: {},
  replyTo: null,
  activeEmojiCategory: 'recent',
  recentEmojis: [],
  mediaRecorder: null,
  recordingStream: null,
  recordingChunks: [],
  recordingTimer: null,
  recordingStartedAt: 0,
  recordingConversationId: null,
  discardRecording: false,
  selectedAudioInputId: '',
  audioContext: null,
  audioMeterFrame: null,
  audioHasSignal: false,
  audioMeterAvailable: false
};

const els = {
  authScreen: document.querySelector('#authScreen'),
  appShell: document.querySelector('#appShell'),
  loginForm: document.querySelector('#loginForm'),
  registerForm: document.querySelector('#registerForm'),
  showLoginBtn: document.querySelector('#showLoginBtn'),
  showRegisterBtn: document.querySelector('#showRegisterBtn'),
  authError: document.querySelector('#authError'),
  conversationList: document.querySelector('#conversationList'),
  inboxConversationList: document.querySelector('#inboxConversationList'),
  inboxEmptyState: document.querySelector('#inboxEmptyState'),
  inboxHome: document.querySelector('#inboxHome'),
  chatView: document.querySelector('#chatView'),
  rightPanel: document.querySelector('#rightPanel'),
  conversationTitle: document.querySelector('#conversationTitle'),
  messageList: document.querySelector('#messageList'),
  messageInput: document.querySelector('#messageInput'),
  composer: document.querySelector('#composer'),
  replyPreview: document.querySelector('#replyPreview'),
  replyPreviewName: document.querySelector('#replyPreviewName'),
  replyPreviewText: document.querySelector('#replyPreviewText'),
  cancelReplyBtn: document.querySelector('#cancelReplyBtn'),
  emojiToggleBtn: document.querySelector('#emojiToggleBtn'),
  emojiPicker: document.querySelector('#emojiPicker'),
  emojiSearch: document.querySelector('#emojiSearch'),
  emojiGrid: document.querySelector('#emojiGrid'),
  voiceRecordBtn: document.querySelector('#voiceRecordBtn'),
  cancelRecordingBtn: document.querySelector('#cancelRecordingBtn'),
  recordingStatus: document.querySelector('#recordingStatus'),
  recordingStatusText: document.querySelector('#recordingStatusText'),
  voiceLevelFill: document.querySelector('#voiceLevelFill'),
  audioInputSelect: document.querySelector('#audioInputSelect'),
  profileName: document.querySelector('#profileName'),
  profileBio: document.querySelector('#profileBio'),
  profileMeta: document.querySelector('#profileMeta'),
  profileAvatar: document.querySelector('#profileAvatar'),
  profileAvatarPreview: document.querySelector('#profileAvatarPreview'),
  signedInAvatar: document.querySelector('#signedInAvatar'),
  profileNameInput: document.querySelector('#profileNameInput'),
  profileBioInput: document.querySelector('#profileBioInput'),
  profileEmailInput: document.querySelector('#profileEmailInput'),
  profilePictureInput: document.querySelector('#profilePictureInput'),
  profileImageStatus: document.querySelector('#profileImageStatus'),
  saveProfileBtn: document.querySelector('#saveProfileBtn'),
  searchInput: document.querySelector('#searchInput'),
  searchResults: document.querySelector('#searchResults'),
  searchToggleBtn: document.querySelector('#searchToggleBtn'),
  searchBox: document.querySelector('.header-search .search-box'),
  typingStatus: document.querySelector('#typingStatus'),
  groupPanel: document.querySelector('#groupPanel'),
  groupMembers: document.querySelector('#groupMembers'),
  groupManageBtn: document.querySelector('#groupManageBtn'),
  closeGroupPanelBtn: document.querySelector('#closeGroupPanelBtn'),
  inviteUserInput: document.querySelector('#inviteUserInput'),
  removeUserInput: document.querySelector('#removeUserInput'),
  newGroupBtn: document.querySelector('#newGroupBtn'),
  settingsBtn: document.querySelector('#settingsBtn'),
  appMenu: document.querySelector('.app-menu'),
  settingsModal: document.querySelector('#settingsModal'),
  closeSettingsBtn: document.querySelector('#closeSettingsBtn'),
  activePeople: document.querySelector('#activePeople'),
  settingsActivePeople: document.querySelector('#settingsActivePeople'),
  activityLog: document.querySelector('#activityLog'),
  signedInName: document.querySelector('#signedInName'),
  logoutBtn: document.querySelector('#logoutBtn'),
  signedInProfileBtn: document.querySelector('#signedInProfileBtn'),
  findPeopleBtn: document.querySelector('#findPeopleBtn'),
  emptyFindPeopleBtn: document.querySelector('#emptyFindPeopleBtn'),
  backToInboxBtn: document.querySelector('#backToInboxBtn'),
  removeProfilePictureBtn: document.querySelector('#removeProfilePictureBtn')
};

async function apiRequest(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 401) {
    clearSession();
    showAuth();
    const error = await response.json().catch(() => ({ error: 'Please log in' }));
    throw new Error(error.error || 'Please log in');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

function formatTime(dateIso) {
  const date = new Date(dateIso);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function getCurrentUser() {
  return state.currentUser || state.users.find((user) => user.id === state.currentUserId) || null;
}

function showAuthError(message) {
  els.authError.textContent = message;
  els.authError.classList.toggle('hidden', !message);
}

function showAuth() {
  els.authScreen.classList.remove('hidden');
  els.appShell.classList.add('hidden');
}

function showApp() {
  els.authScreen.classList.add('hidden');
  els.appShell.classList.remove('hidden');
}

function clearSession() {
  state.token = null;
  state.currentUser = null;
  state.currentUserId = null;
  state.activeConversationId = null;
  state.avatarDraft = undefined;
  localStorage.removeItem(TOKEN_KEY);
}

function setAvatar(element, avatar, name) {
  if (!element) return;
  element.replaceChildren();
  const isImage = typeof avatar === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar);
  element.classList.toggle('has-image', isImage);
  if (isImage) {
    const image = document.createElement('img');
    image.src = avatar;
    image.alt = '';
    element.appendChild(image);
    return;
  }
  element.textContent = (String(name || '').trim().charAt(0) || '?').toUpperCase();
}

function showInbox() {
  state.activeConversationId = null;
  els.appShell.classList.add('inbox-mode');
  els.inboxHome.classList.remove('hidden');
  els.chatView.classList.add('hidden');
  els.groupPanel.classList.add('hidden');
  els.groupManageBtn.classList.add('hidden');
  renderConversationList();
}

function applyAppearance(settings = {}) {
  document.body.dataset.theme = settings.theme || 'light';
  document.body.dataset.density = settings.density || 'comfortable';
  document.body.dataset.font = settings.fontSize || 'medium';
  document.body.dataset.sidebar = settings.compactSidebar ? 'compact' : 'comfortable';
  document.body.dataset.motion = settings.reduceMotion ? 'reduced' : 'full';
  document.body.dataset.messageTimes = settings.showMessageTimes === false ? 'hidden' : 'visible';
}

function fillSettingsForm(user) {
  const settings = user.settings || {};
  document.querySelector('#settingTheme').value = settings.theme || 'light';
  document.querySelector('#settingDensity').value = settings.density || 'comfortable';
  document.querySelector('#settingFontSize').value = settings.fontSize || 'medium';
  document.querySelector('#settingStatus').value = user.status === 'offline' ? 'offline' : (user.status || 'online');
  document.querySelector('#settingCompactSidebar').checked = settings.compactSidebar === true;
  document.querySelector('#settingShowMessageTimes').checked = settings.showMessageTimes !== false;
  document.querySelector('#settingReduceMotion').checked = settings.reduceMotion === true;
  document.querySelector('#settingNotifications').checked = settings.notifications !== false;
  document.querySelector('#settingSound').checked = settings.sound !== false;
  document.querySelector('#settingReadReceipts').checked = settings.readReceipts !== false;
  document.querySelector('#settingLastSeen').checked = settings.showLastSeen !== false;
  els.activityLog.innerHTML = (user.activity || []).map((item) => `
    <div class="activity-item">${item.detail} · ${formatTime(item.createdAt)}</div>
  `).join('') || '<div class="activity-item">No activity yet</div>';
}

function renderActivePeople(people = state.activePeople) {
  const active = people.filter((user) => user.id !== state.currentUserId && (user.status === 'online' || user.status === 'away'));
  [els.activePeople, els.settingsActivePeople].forEach((container) => {
    if (!active.length) {
      const empty = document.createElement('div');
      empty.className = 'activity-item';
      empty.textContent = 'No one is active right now';
      container.replaceChildren(empty);
      return;
    }
    container.replaceChildren(...active.map((user) => {
      const button = document.createElement('button');
      button.className = 'active-person';
      button.type = 'button';
      const avatar = document.createElement('span');
      avatar.className = 'avatar-small';
      setAvatar(avatar, user.avatar, user.name);
      const name = document.createElement('span');
      name.textContent = user.name;
      button.append(avatar, name);
      button.addEventListener('click', () => createDirectChat(user.id));
      return button;
    }));
  });
}

function setCurrentUser(user) {
  state.currentUser = user;
  state.currentUserId = user.id;
  state.activeConversationId = null;
  state.avatarDraft = undefined;
  showInbox();
  socket.emit('register_user', user.id);
  applyAppearance(user.settings);
  fillSettingsForm(user);
  renderProfile();
  loadConversations();
  loadActivePeople();
}

function renderProfile() {
  const user = getCurrentUser();
  if (!user) return;

  const avatar = state.avatarDraft === undefined ? user.avatar : state.avatarDraft;
  setAvatar(els.profileAvatar, user.avatar, user.name);
  setAvatar(els.profileAvatarPreview, avatar, els.profileNameInput.value || user.name);
  setAvatar(els.signedInAvatar, user.avatar, user.name);
  els.profileName.textContent = user.name;
  els.profileBio.textContent = user.bio || 'No bio yet';
  els.profileMeta.textContent = `@${user.username || ''} · ${user.status}${user.age ? ` · ${user.age}` : ''}`;
  els.profileNameInput.value = user.name;
  els.profileBioInput.value = user.bio || '';
  els.profileEmailInput.value = user.email || '';
  els.signedInName.textContent = `${user.name} (@${user.username})`;
}

function getConversationAvatar(conversation) {
  if (conversation.type === 'group') {
    const group = state.groups.find((item) => item.conversationId === conversation.id);
    return { avatar: group?.avatar, name: conversation.title || 'Group' };
  }
  const person = conversation.members?.find((member) => member.id !== state.currentUserId)
    || state.users.find((user) => conversation.participants.includes(user.id) && user.id !== state.currentUserId);
  return { avatar: person?.avatar, name: person?.name || conversation.title || 'Conversation' };
}

function makeConversationButton(conversation, className) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = `${className} ${conversation.id === state.activeConversationId ? 'active' : ''}`;

  const avatar = document.createElement('span');
  avatar.className = 'conversation-avatar';
  const identity = getConversationAvatar(conversation);
  setAvatar(avatar, identity.avatar, identity.name);

  const body = document.createElement('span');
  body.className = 'conversation-body';
  const heading = document.createElement('span');
  heading.className = 'conversation-head';
  const name = document.createElement('span');
  name.className = 'conversation-name';
  name.textContent = conversation.title || 'Conversation';
  const time = document.createElement('span');
  time.className = 'conversation-time';
  time.textContent = conversation.latestMessage ? formatTime(conversation.latestMessage.createdAt) : '';
  heading.append(name, time);

  const preview = document.createElement('span');
  preview.className = 'conversation-preview';
  preview.textContent = conversation.latestMessage?.text || 'No messages yet';
  body.append(heading, preview);
  item.append(avatar, body);

  if (conversation.unreadCount > 0) {
    const unread = document.createElement('span');
    unread.className = 'unread-count';
    unread.textContent = String(conversation.unreadCount);
    item.appendChild(unread);
  }

  item.addEventListener('click', () => selectConversation(conversation.id));
  return item;
}

function renderConversationList() {
  const userId = state.currentUserId;
  const items = state.conversations
    .filter((conversation) => conversation.participants.includes(userId))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  els.conversationList.replaceChildren(...items.map((conversation) => makeConversationButton(conversation, 'conversation-item')));
  els.inboxConversationList.replaceChildren(...items.map((conversation) => makeConversationButton(conversation, 'inbox-conversation-item')));
  els.inboxEmptyState.classList.toggle('hidden', items.length > 0);
}

function renderMessages(conversation) {
  if (!conversation) {
    els.messageList.innerHTML = '<div class="message-row"><div class="message-bubble">Select a conversation</div></div>';
    return;
  }

  const currentUser = getCurrentUser();
  const reactionChoices = ['❤️', '😂', '👍', '😮', '😢', '👏'];
  els.messageList.replaceChildren(...conversation.messages.map((message) => {
    const textContent = message.text || 'Voice clip';
    const isMine = message.senderId === currentUser.id;
    const showReceipts = currentUser.settings?.readReceipts !== false;
    const readByText = showReceipts && message.readBy && message.readBy.length > 1 ? ` · Seen by ${message.readBy.length - 1}` : '';
    const row = document.createElement('div');
    row.className = `message-row ${isMine ? 'me' : 'other'}`;
    row.dataset.messageId = message.id;

    const content = document.createElement('div');
    content.className = 'message-content';
    const line = document.createElement('div');
    line.className = 'message-line';
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.innerHTML = `
      <button type="button" data-message-action="reply" aria-label="Reply" title="Reply"><i class="fa-solid fa-reply" aria-hidden="true"></i></button>
      <button type="button" data-message-action="forward" aria-label="Forward" title="Forward"><i class="fa-solid fa-share" aria-hidden="true"></i></button>
      <button type="button" data-message-action="react" aria-label="React" title="React"><i class="fa-regular fa-face-smile" aria-hidden="true"></i></button>
    `;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    if (message.forwardedFrom) {
      const forwardedLabel = document.createElement('div');
      forwardedLabel.className = 'message-forwarded-label';
      forwardedLabel.textContent = `Forwarded from ${message.forwardedFrom.senderName}`;
      bubble.appendChild(forwardedLabel);
    }
    if (message.replyTo) {
      const quoted = document.createElement('div');
      quoted.className = 'message-quote';
      const quoteName = document.createElement('strong');
      quoteName.textContent = message.replyTo.senderName;
      const quoteText = document.createElement('span');
      quoteText.textContent = message.replyTo.text;
      quoted.append(quoteName, quoteText);
      bubble.appendChild(quoted);
    }
    const text = document.createElement('div');
    text.className = 'message-text';
    text.textContent = textContent;
    bubble.appendChild(text);
    if (message.audioClip?.dataUrl) {
      const audio = document.createElement('audio');
      audio.className = 'voice-clip-player';
      audio.controls = true;
      audio.preload = 'none';
      audio.src = message.audioClip.dataUrl;
      audio.setAttribute('aria-label', 'Voice message');
      audio.addEventListener('error', () => {
        const failure = document.createElement('div');
        failure.className = 'audio-playback-error';
        failure.textContent = 'This voice clip could not be played. Ask the sender to record it again.';
        audio.replaceWith(failure);
      }, { once: true });
      bubble.appendChild(audio);
      audio.load();
    }
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = `${formatTime(message.createdAt)}${readByText}`;
    bubble.appendChild(meta);

    const reactionList = document.createElement('div');
    reactionList.className = 'message-reactions';
    const reactionGroups = (message.reactions || []).reduce((groups, reaction) => {
      const group = groups.find((item) => item.emoji === reaction.emoji);
      if (group) group.users.push(reaction.userId);
      else groups.push({ emoji: reaction.emoji, users: [reaction.userId] });
      return groups;
    }, []);
    reactionGroups.forEach((group) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `reaction-chip ${group.users.includes(currentUser.id) ? 'selected' : ''}`;
      chip.dataset.messageAction = 'choose-reaction';
      chip.dataset.emoji = group.emoji;
      chip.textContent = `${group.emoji} ${group.users.length}`;
      reactionList.appendChild(chip);
    });

    const reactionPicker = document.createElement('div');
    reactionPicker.className = 'reaction-picker hidden';
    reactionChoices.forEach((emoji) => {
      const choice = document.createElement('button');
      choice.type = 'button';
      choice.dataset.messageAction = 'choose-reaction';
      choice.dataset.emoji = emoji;
      choice.textContent = emoji;
      choice.setAttribute('aria-label', `React ${emoji}`);
      reactionPicker.appendChild(choice);
    });

    const forwardMenu = document.createElement('div');
    forwardMenu.className = 'forward-menu hidden';
    state.conversations.filter((item) => item.id !== conversation.id).forEach((target) => {
      const targetButton = document.createElement('button');
      targetButton.type = 'button';
      targetButton.dataset.messageAction = 'forward-to';
      targetButton.dataset.conversationId = target.id;
      targetButton.textContent = target.title || 'Conversation';
      forwardMenu.appendChild(targetButton);
    });

    if (isMine) line.append(actions, bubble);
    else line.append(bubble, actions);
    content.append(line, reactionList, reactionPicker, forwardMenu);
    row.appendChild(content);
    row.dataset.messageText = message.text;
    row.dataset.senderName = state.users.find((user) => user.id === message.senderId)?.name || 'Someone';
    return row;
  }));

  els.messageList.scrollTop = els.messageList.scrollHeight;
}

function setReplyDraft(message) {
  state.replyTo = message;
  els.replyPreviewName.textContent = `Replying to ${message.senderName}`;
  els.replyPreviewText.textContent = message.text;
  els.replyPreview.classList.remove('hidden');
  els.messageInput.focus();
}

function clearReplyDraft() {
  state.replyTo = null;
  els.replyPreview.classList.add('hidden');
  els.replyPreviewName.textContent = '';
  els.replyPreviewText.textContent = '';
}

function buildEmojiPicker() {
  const emojis = [
    { category: 'smileys', emoji: '😀', words: 'grin happy face' },
    { category: 'smileys', emoji: '😂', words: 'laugh tears funny' },
    { category: 'smileys', emoji: '🥰', words: 'love hearts smile' },
    { category: 'smileys', emoji: '😍', words: 'love heart eyes' },
    { category: 'smileys', emoji: '😊', words: 'smile blush happy' },
    { category: 'smileys', emoji: '😉', words: 'wink' },
    { category: 'smileys', emoji: '😭', words: 'cry sad tears' },
    { category: 'smileys', emoji: '😮', words: 'surprised wow' },
    { category: 'smileys', emoji: '😎', words: 'cool sunglasses' },
    { category: 'smileys', emoji: '🤔', words: 'think question' },
    { category: 'people', emoji: '👋', words: 'wave hello' },
    { category: 'people', emoji: '🙏', words: 'please thanks pray' },
    { category: 'people', emoji: '👏', words: 'clap bravo' },
    { category: 'people', emoji: '👍', words: 'thumb up yes' },
    { category: 'people', emoji: '👎', words: 'thumb down no' },
    { category: 'people', emoji: '🙌', words: 'celebrate hands' },
    { category: 'nature', emoji: '🌿', words: 'leaf plant nature' },
    { category: 'nature', emoji: '🌸', words: 'flower spring' },
    { category: 'nature', emoji: '🐶', words: 'dog puppy' },
    { category: 'nature', emoji: '🐱', words: 'cat kitten' },
    { category: 'food', emoji: '🍕', words: 'pizza food' },
    { category: 'food', emoji: '☕', words: 'coffee drink' },
    { category: 'food', emoji: '🍰', words: 'cake dessert' },
    { category: 'food', emoji: '🍎', words: 'apple fruit' },
    { category: 'activity', emoji: '⚽', words: 'football soccer sport' },
    { category: 'activity', emoji: '🎉', words: 'party celebrate' },
    { category: 'activity', emoji: '🔥', words: 'fire hot' },
    { category: 'activity', emoji: '✨', words: 'sparkles magic' },
    { category: 'symbols', emoji: '❤️', words: 'heart love' },
    { category: 'symbols', emoji: '💯', words: 'hundred perfect' },
    { category: 'symbols', emoji: '✅', words: 'check done yes' },
    { category: 'symbols', emoji: '❌', words: 'cross no' }
  ];

  function renderEmojiChoices() {
    const query = els.emojiSearch.value.trim().toLowerCase();
    const recentEmojis = state.recentEmojis.length
      ? state.recentEmojis
      : emojis.filter((item) => item.category === 'smileys').slice(0, 14).map((item) => item.emoji);
    const matches = emojis.filter((item) => {
      const inCategory = state.activeEmojiCategory === 'recent'
        ? recentEmojis.includes(item.emoji)
        : item.category === state.activeEmojiCategory;
      return query
        ? `${item.emoji} ${item.words}`.toLowerCase().includes(query)
        : inCategory;
    });
    els.emojiGrid.replaceChildren(...matches.map(({ emoji }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'emoji-choice';
    button.textContent = emoji;
    button.setAttribute('aria-label', emoji);
    button.addEventListener('click', () => {
      const input = els.messageInput;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      input.setRangeText(emoji, start, end, 'end');
      input.focus();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      state.recentEmojis = [emoji, ...state.recentEmojis.filter((item) => item !== emoji)].slice(0, 12);
      if (state.activeEmojiCategory === 'recent') renderEmojiChoices();
    });
    return button;
  }));
  }

  els.emojiPicker.querySelectorAll('[data-emoji-category]').forEach((tab) => {
    tab.addEventListener('click', () => {
      state.activeEmojiCategory = tab.dataset.emojiCategory;
      els.emojiPicker.querySelectorAll('[data-emoji-category]').forEach((item) => item.classList.toggle('active', item === tab));
      els.emojiSearch.value = '';
      renderEmojiChoices();
    });
  });
  els.emojiSearch.addEventListener('input', renderEmojiChoices);
  renderEmojiChoices();
}

function renderGroupPanel(conversation) {
  const isGroup = conversation && conversation.type === 'group';
  const group = isGroup ? state.groups?.find((item) => item.conversationId === conversation.id) : null;
  const canManage = Boolean(group?.admins?.includes(state.currentUserId));
  els.groupManageBtn.classList.toggle('hidden', !canManage);
  els.groupPanel.classList.add('hidden');
  if (!isGroup) return;

  if (!group) return;

  els.groupMembers.replaceChildren(...group.members.map((memberId) => {
    const pill = document.createElement('span');
    pill.className = 'member-pill';
    pill.textContent = state.users.find((user) => user.id === memberId)?.name || memberId;
    return pill;
  }));
}

function openSettings(tab = 'profile') {
  els.appMenu.open = false;
  els.settingsModal.classList.remove('hidden');
  const target = document.querySelector(`.settings-tab[data-tab="${tab}"]`);
  target?.click();
}

function focusPeopleSearch() {
  const buttonBounds = els.searchToggleBtn.getBoundingClientRect();
  const popupTop = Math.min(buttonBounds.bottom + 8, window.innerHeight - 280);
  els.searchBox.style.setProperty('--search-popup-top', `${Math.max(12, popupTop)}px`);
  els.searchBox.classList.remove('hidden');
  els.searchInput.focus();
  handleSearch(els.searchInput.value);
}

async function loadUsers() {
  const users = await apiRequest('/api/users');
  state.users = users;
  renderProfile();
  renderConversationList();
}

async function loadActivePeople() {
  try {
    const people = await apiRequest('/api/users/active');
    state.activePeople = people;
    renderActivePeople(people);
  } catch (error) {
    console.error(error);
  }
}

async function loadConversations() {
  try {
    const data = await apiRequest('/api/conversations');
    state.conversations = data;
    renderConversationList();
    if (state.activeConversationId) {
      const active = state.conversations.find((c) => c.id === state.activeConversationId) || null;
      renderMessages(active);
      renderGroupPanel(active);
    } else {
      showInbox();
    }
  } catch (error) {
    console.error(error);
  }
}

async function selectConversation(conversationId) {
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!conversation) return;

  state.activeConversationId = conversationId;
  els.appShell.classList.remove('inbox-mode');
  els.inboxHome.classList.add('hidden');
  els.chatView.classList.remove('hidden');
  els.rightPanel.classList.remove('hidden');
  socket.emit('join_conversation', conversationId);
  els.conversationTitle.textContent = conversation.title || 'Conversation';
  renderConversationList();
  renderMessages(conversation);
  renderGroupPanel(conversation);
  const userId = state.currentUserId;
  const lastMsg = conversation.messages[conversation.messages.length - 1];
  if (lastMsg && !lastMsg.readBy.includes(userId)) {
    await apiRequest(`/api/conversations/${conversationId}/read`, {
      method: 'POST',
      body: JSON.stringify({ messageId: lastMsg.id })
    });
  }
}

async function createDirectChat(otherUserId) {
  const conversation = await apiRequest('/api/conversations/direct', {
    method: 'POST',
    body: JSON.stringify({ userB: otherUserId })
  });

  await loadConversations();
  selectConversation(conversation.id);
}

async function createGroupFromSearch() {
  els.appMenu.open = false;
  const name = window.prompt('Group name?');
  if (!name) return;

  const members = [state.currentUserId, ...state.users.slice(0, 2).map((user) => user.id).filter((id) => id !== state.currentUserId)];
  const group = await apiRequest('/api/groups', {
    method: 'POST',
    body: JSON.stringify({
      name,
      description: 'New group chat',
      members
    })
  });

  state.groups.push(group.group);
  await loadConversations();
  selectConversation(group.conversation.id);
}

async function sendMessage() {
  const text = els.messageInput.value.trim();
  if (!text || !state.activeConversationId) return;

  await apiRequest(`/api/conversations/${state.activeConversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ text, replyTo: state.replyTo })
  });

  els.messageInput.value = '';
  clearReplyDraft();
  socket.emit('typing', { conversationId: state.activeConversationId, userId: state.currentUserId, isTyping: false });
  await loadConversations();
}

function setRecordingStatus(text) {
  els.recordingStatusText.textContent = text;
  els.recordingStatus.classList.toggle('hidden', !text);
}

function resetRecordingControls() {
  els.voiceRecordBtn.classList.remove('recording');
  els.voiceRecordBtn.innerHTML = '<i class="fa-solid fa-microphone" aria-hidden="true"></i>';
  els.voiceRecordBtn.setAttribute('aria-label', 'Record voice clip');
  els.voiceRecordBtn.title = 'Record voice clip';
}

async function refreshAudioInputs() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices.filter((device) => device.kind === 'audioinput');
  els.audioInputSelect.replaceChildren(...inputs.map((device, index) => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = device.label || `Microphone ${index + 1}`;
    return option;
  }));
  els.audioInputSelect.classList.toggle('hidden', inputs.length < 2);
  if (state.selectedAudioInputId && inputs.some((device) => device.deviceId === state.selectedAudioInputId)) {
    els.audioInputSelect.value = state.selectedAudioInputId;
  } else {
    state.selectedAudioInputId = '';
  }
}

async function startVoiceLevelMonitor(stream) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    const context = new AudioContextClass();
    await context.resume();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    state.audioContext = context;
    state.audioMeterAvailable = true;

    const measure = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const amplitude = (sample - 128) / 128;
        sum += amplitude * amplitude;
      }
      const level = Math.sqrt(sum / samples.length);
      els.voiceLevelFill.style.width = `${Math.min(100, Math.round(level * 500))}%`;
      if (level > 0.004) state.audioHasSignal = true;
      state.audioMeterFrame = requestAnimationFrame(measure);
    };
    measure();
  } catch {
    state.audioMeterAvailable = false;
  }
}

function stopVoiceLevelMonitor() {
  if (state.audioMeterFrame !== null) cancelAnimationFrame(state.audioMeterFrame);
  state.audioMeterFrame = null;
  if (state.audioContext && state.audioContext.state !== 'closed') state.audioContext.close();
  state.audioContext = null;
  els.voiceLevelFill.style.width = '0%';
}

async function startVoiceRecording() {
  if (!state.activeConversationId) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setRecordingStatus('Voice recording is not supported in this browser.');
    return;
  }

  try {
    const audioConstraints = {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
      ...(state.selectedAudioInputId ? { deviceId: { exact: state.selectedAudioInputId } } : {})
    };
    const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    await refreshAudioInputs().catch(() => {});
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4']
      .find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    state.mediaRecorder = recorder;
    state.recordingStream = stream;
    state.recordingChunks = [];
    state.recordingConversationId = state.activeConversationId;
    state.discardRecording = false;
    state.recordingStartedAt = Date.now();
    state.audioHasSignal = false;
    state.audioMeterAvailable = false;

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size) state.recordingChunks.push(event.data);
    });
    recorder.addEventListener('stop', async () => {
      const duration = Math.min(60, Math.round((Date.now() - state.recordingStartedAt) / 1000));
      const chunks = state.recordingChunks;
      const discard = state.discardRecording;
      const conversationId = state.recordingConversationId;
      const audioHasSignal = state.audioHasSignal;
      const canCheckSignal = state.audioMeterAvailable;
      stream.getTracks().forEach((track) => track.stop());
      stopVoiceLevelMonitor();
      clearInterval(state.recordingTimer);
      state.recordingTimer = null;
      state.mediaRecorder = null;
      state.recordingStream = null;
      state.recordingChunks = [];
      resetRecordingControls();

      if (discard) {
        setRecordingStatus('');
        return;
      }

      const clip = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      if (!clip.size) {
        setRecordingStatus('No audio was captured. Try recording again.');
        return;
      }
      if (clip.size > 1024 * 1024) {
        setRecordingStatus('Clip is too large. Record a shorter voice message.');
        return;
      }

      setRecordingStatus('Sending voice clip...');
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.addEventListener('load', () => resolve(reader.result));
          reader.addEventListener('error', () => reject(new Error('Could not read the voice clip.')));
          reader.readAsDataURL(clip);
        });
        await apiRequest(`/api/conversations/${conversationId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ audioClip: { dataUrl, duration } })
        });
        setRecordingStatus(canCheckSignal && !audioHasSignal
          ? 'Voice clip sent, but no mic sound was detected. Check the microphone input.'
          : 'Voice clip sent.');
        await loadConversations();
      } catch (error) {
        setRecordingStatus(error.message || 'Could not send the voice clip.');
      }
    }, { once: true });

    await startVoiceLevelMonitor(stream);
    recorder.start();
    els.voiceRecordBtn.classList.add('recording');
    els.voiceRecordBtn.innerHTML = '<i class="fa-solid fa-stop" aria-hidden="true"></i>';
    els.voiceRecordBtn.setAttribute('aria-label', 'Stop and send voice clip');
    els.voiceRecordBtn.title = 'Stop and send voice clip';
    setRecordingStatus('Recording voice clip · 00:00');
    state.recordingTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - state.recordingStartedAt) / 1000);
      const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const seconds = String(elapsed % 60).padStart(2, '0');
      setRecordingStatus(`Recording voice clip · ${minutes}:${seconds}`);
      if (elapsed >= 60 && state.mediaRecorder?.state === 'recording') state.mediaRecorder.stop();
    }, 1000);
  } catch (error) {
    setRecordingStatus(error.name === 'NotAllowedError'
      ? 'Allow microphone access to record a voice clip.'
      : 'Could not start recording. Check your microphone.');
  }
}

function stopVoiceRecording(discard = false) {
  if (!state.mediaRecorder || state.mediaRecorder.state !== 'recording') return;
  state.discardRecording = discard;
  state.mediaRecorder.stop();
}

async function toggleMessageReaction(messageId, emoji) {
  if (!state.activeConversationId) return;
  await apiRequest(`/api/conversations/${state.activeConversationId}/messages/${messageId}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ emoji })
  });
  await loadConversations();
}

async function forwardMessage(message, targetConversationId) {
  const source = state.conversations.find((item) => item.id === state.activeConversationId);
  await apiRequest(`/api/conversations/${targetConversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      text: message.text,
      audioClip: message.audioClip,
      forwardedFrom: {
        senderName: state.users.find((user) => user.id === message.senderId)?.name || 'Someone',
        conversationTitle: source?.title || 'a conversation'
      }
    })
  });
  await loadConversations();
}

async function saveProfile() {
  const user = getCurrentUser();
  if (!user) return;

  const updated = await apiRequest(`/api/users/${user.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: els.profileNameInput.value.trim() || user.name,
      bio: els.profileBioInput.value.trim(),
      email: els.profileEmailInput.value.trim() || user.email,
      avatar: state.avatarDraft === undefined
        ? user.avatar
        : (state.avatarDraft || (els.profileNameInput.value || user.name).trim().slice(0, 1).toUpperCase())
    })
  });

  state.currentUser = updated;
  state.avatarDraft = undefined;
  els.profilePictureInput.value = '';
  els.profileImageStatus.textContent = '';
  state.users = state.users.map((item) => item.id === updated.id ? updated : item);
  renderProfile();
  await loadConversations();
}

async function imageFileToDataUrl(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a PNG, JPG, or WebP image.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Choose an image smaller than 5 MB.');
  }

  const imageUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = imageUrl;
    await image.decode();
    const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

async function saveSettings(partial) {
  const user = getCurrentUser();
  if (!user) return;
  const payload = {
    theme: document.querySelector('#settingTheme').value,
    density: document.querySelector('#settingDensity').value,
    fontSize: document.querySelector('#settingFontSize').value,
    compactSidebar: document.querySelector('#settingCompactSidebar').checked,
    showMessageTimes: document.querySelector('#settingShowMessageTimes').checked,
    reduceMotion: document.querySelector('#settingReduceMotion').checked,
    notifications: document.querySelector('#settingNotifications').checked,
    sound: document.querySelector('#settingSound').checked,
    readReceipts: document.querySelector('#settingReadReceipts').checked,
    showLastSeen: document.querySelector('#settingLastSeen').checked,
    ...partial
  };
  const result = await apiRequest(`/api/users/${user.id}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  state.currentUser = result.user;
  applyAppearance(result.settings);
  fillSettingsForm(result.user);
}

async function handleSearch(value) {
  const q = value.trim();
  try {
    const results = q
      ? await apiRequest(`/api/search?q=${encodeURIComponent(q)}`)
      : { users: state.users, groups: [] };
    const users = results.users.filter((user) => user.id !== state.currentUserId);
    const rows = [];
    if (!users.length && !results.groups.length) {
      const empty = document.createElement('div');
      empty.className = 'search-item search-empty';
      empty.textContent = q ? 'No people or groups found' : 'No other accounts yet';
      rows.push(empty);
    }
    for (const user of users) {
      const button = document.createElement('button');
      button.className = 'search-item';
      button.type = 'button';
      const avatar = document.createElement('span');
      avatar.className = 'avatar-small';
      setAvatar(avatar, user.avatar, user.name);
      const identity = document.createElement('span');
      identity.className = 'search-identity';
      const name = document.createElement('strong');
      name.textContent = user.name;
      const username = document.createElement('span');
      username.textContent = `@${user.username || ''}`;
      identity.append(name, username);
      button.append(avatar, identity);
      button.addEventListener('click', async () => {
        await createDirectChat(user.id);
        els.searchInput.value = '';
        els.searchResults.classList.add('hidden');
        els.searchBox.classList.add('hidden');
      });
      rows.push(button);
    }
    for (const group of results.groups.filter((item) => state.conversations.some((conversation) => conversation.groupId === item.id))) {
      const button = document.createElement('button');
      button.className = 'search-item';
      button.type = 'button';
      button.innerHTML = '<i class="fa-solid fa-users" aria-hidden="true"></i>';
      const name = document.createElement('span');
      name.textContent = `Group: ${group.name}`;
      button.appendChild(name);
      button.addEventListener('click', () => {
        const conversation = state.conversations.find((item) => item.groupId === group.id);
        if (conversation) selectConversation(conversation.id);
        els.searchInput.value = '';
        els.searchResults.classList.add('hidden');
        els.searchBox.classList.add('hidden');
      });
      rows.push(button);
    }
    els.searchResults.replaceChildren(...rows);
    els.searchResults.classList.remove('hidden');
  } catch (error) {
    console.error(error);
  }
}

async function inviteUserToGroup() {
  const conversation = state.conversations.find((item) => item.id === state.activeConversationId);
  if (!conversation || conversation.type !== 'group') return;

  const group = state.groups?.find((item) => item.conversationId === conversation.id);
  const userId = els.inviteUserInput.value.trim();
  if (!group || !userId) return;

  await apiRequest(`/api/groups/${group.id}/members`, {
    method: 'POST',
    body: JSON.stringify({ userId })
  });

  els.inviteUserInput.value = '';
  state.groups = await apiRequest('/api/groups');
  await loadConversations();
  selectConversation(conversation.id);
}

async function removeUserFromGroup() {
  const conversation = state.conversations.find((item) => item.id === state.activeConversationId);
  if (!conversation || conversation.type !== 'group') return;

  const group = state.groups?.find((item) => item.conversationId === conversation.id);
  const userId = els.removeUserInput.value.trim();
  if (!group || !userId) return;

  await apiRequest(`/api/groups/${group.id}/remove-member`, {
    method: 'POST',
    body: JSON.stringify({ userId })
  });

  els.removeUserInput.value = '';
  state.groups = await apiRequest('/api/groups');
  await loadConversations();
  selectConversation(conversation.id);
}

async function login(identifier, password) {
  const result = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password })
  });
  state.token = result.token;
  localStorage.setItem(TOKEN_KEY, result.token);
  await enterApp(result.user);
}

async function register(payload) {
  const result = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  state.token = result.token;
  localStorage.setItem(TOKEN_KEY, result.token);
  await enterApp(result.user);
}

async function logout() {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } catch (error) {
    console.error(error);
  }
  clearSession();
  els.appMenu.open = false;
  els.settingsModal.classList.add('hidden');
  showInbox();
  showAuth();
}

async function enterApp(user) {
  showApp();
  setCurrentUser(user);
  await loadUsers();
  state.groups = await apiRequest('/api/groups').catch(() => []);
  await loadConversations();
  await loadActivePeople();
}

function bindEvents() {
  els.showLoginBtn.addEventListener('click', () => {
    els.loginForm.classList.remove('hidden');
    els.registerForm.classList.add('hidden');
    els.showLoginBtn.classList.add('active');
    els.showRegisterBtn.classList.remove('active');
    showAuthError('');
  });

  els.showRegisterBtn.addEventListener('click', () => {
    els.registerForm.classList.remove('hidden');
    els.loginForm.classList.add('hidden');
    els.showRegisterBtn.classList.add('active');
    els.showLoginBtn.classList.remove('active');
    showAuthError('');
  });

  els.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    showAuthError('');
    try {
      await login(
        document.querySelector('#loginIdentifier').value.trim(),
        document.querySelector('#loginPassword').value
      );
    } catch (error) {
      showAuthError(error.message);
    }
  });

  els.registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    showAuthError('');
    try {
      await register({
        firstName: document.querySelector('#regFirstName').value.trim(),
        lastName: document.querySelector('#regLastName').value.trim(),
        email: document.querySelector('#regEmail').value.trim(),
        username: document.querySelector('#regUsername').value.trim(),
        phone: document.querySelector('#regPhone').value.trim(),
        age: document.querySelector('#regAge').value,
        timeOfBirth: document.querySelector('#regTimeOfBirth').value,
        password: document.querySelector('#regPassword').value,
        confirmPassword: document.querySelector('#regConfirmPassword').value
      });
    } catch (error) {
      showAuthError(error.message);
    }
  });

  els.composer.addEventListener('submit', async (event) => {
    event.preventDefault();
    await sendMessage();
  });

  buildEmojiPicker();
  els.emojiToggleBtn.addEventListener('click', () => {
    els.emojiPicker.classList.toggle('hidden');
  });
  els.voiceRecordBtn.addEventListener('click', () => {
    if (state.mediaRecorder?.state === 'recording') stopVoiceRecording();
    else startVoiceRecording();
  });
  els.cancelRecordingBtn.addEventListener('click', () => stopVoiceRecording(true));
  els.audioInputSelect.addEventListener('change', () => {
    state.selectedAudioInputId = els.audioInputSelect.value;
  });
  els.cancelReplyBtn.addEventListener('click', clearReplyDraft);
  els.messageList.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-message-action]');
    if (!action) return;
    const row = action.closest('.message-row');
    const conversation = state.conversations.find((item) => item.id === state.activeConversationId);
    const message = conversation?.messages.find((item) => item.id === row?.dataset.messageId);
    if (!row || !message) return;

    if (action.dataset.messageAction === 'reply') {
      setReplyDraft({
        id: message.id,
        senderId: message.senderId,
        senderName: row.dataset.senderName,
        text: (message.text || 'Voice clip').slice(0, 300)
      });
    } else if (action.dataset.messageAction === 'react') {
      row.querySelector('.reaction-picker')?.classList.toggle('hidden');
    } else if (action.dataset.messageAction === 'choose-reaction') {
      await toggleMessageReaction(message.id, action.dataset.emoji);
    } else if (action.dataset.messageAction === 'forward') {
      row.querySelector('.forward-menu')?.classList.toggle('hidden');
    } else if (action.dataset.messageAction === 'forward-to') {
      await forwardMessage(message, action.dataset.conversationId);
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.emoji-control')) els.emojiPicker.classList.add('hidden');
    if (!event.target.closest('.header-search')) {
      els.searchBox.classList.add('hidden');
      els.searchResults.classList.add('hidden');
    }
  });

  els.messageInput.addEventListener('input', () => {
    const conversationId = state.activeConversationId;
    if (!conversationId) return;

    socket.emit('typing', {
      conversationId,
      userId: state.currentUserId,
      isTyping: els.messageInput.value.trim().length > 0
    });
  });

  els.saveProfileBtn.addEventListener('click', saveProfile);
  els.profileNameInput.addEventListener('input', () => {
    if (state.avatarDraft === undefined || !state.avatarDraft) {
      setAvatar(els.profileAvatarPreview, '', els.profileNameInput.value);
    }
  });
  els.profilePictureInput.addEventListener('change', async () => {
    const file = els.profilePictureInput.files?.[0];
    if (!file) return;
    try {
      state.avatarDraft = await imageFileToDataUrl(file);
      els.profileImageStatus.textContent = 'Picture ready. Save profile to apply it.';
      setAvatar(els.profileAvatarPreview, state.avatarDraft, els.profileNameInput.value);
    } catch (error) {
      state.avatarDraft = undefined;
      els.profileImageStatus.textContent = error.message;
      els.profilePictureInput.value = '';
    }
  });
  els.removeProfilePictureBtn.addEventListener('click', () => {
    state.avatarDraft = '';
    els.profilePictureInput.value = '';
    els.profileImageStatus.textContent = 'Initial avatar selected. Save profile to apply it.';
    setAvatar(els.profileAvatarPreview, '', els.profileNameInput.value);
  });
  els.searchInput.addEventListener('focus', () => handleSearch(els.searchInput.value));
  els.searchInput.addEventListener('input', (event) => handleSearch(event.target.value));
  els.searchToggleBtn.addEventListener('click', () => {
    if (els.searchBox.classList.contains('hidden')) {
      focusPeopleSearch();
    } else {
      els.searchBox.classList.add('hidden');
      els.searchResults.classList.add('hidden');
      els.searchInput.blur();
    }
  });
  els.searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      els.searchInput.value = '';
      els.searchResults.classList.add('hidden');
      els.searchBox.classList.add('hidden');
      els.searchInput.blur();
    }
  });
  els.newGroupBtn.addEventListener('click', createGroupFromSearch);
  document.querySelector('#inviteUserBtn').addEventListener('click', inviteUserToGroup);
  document.querySelector('#removeUserBtn').addEventListener('click', removeUserFromGroup);
  els.logoutBtn.addEventListener('click', logout);
  els.settingsBtn.addEventListener('click', () => openSettings());
  els.signedInProfileBtn.addEventListener('click', () => openSettings('profile'));
  els.closeSettingsBtn.addEventListener('click', () => els.settingsModal.classList.add('hidden'));
  els.findPeopleBtn.addEventListener('click', focusPeopleSearch);
  els.emptyFindPeopleBtn.addEventListener('click', focusPeopleSearch);
  els.backToInboxBtn.addEventListener('click', showInbox);
  els.groupManageBtn.addEventListener('click', () => els.groupPanel.classList.remove('hidden'));
  els.closeGroupPanelBtn.addEventListener('click', () => els.groupPanel.classList.add('hidden'));

  document.querySelectorAll('.settings-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.settings-tab').forEach((item) => item.classList.remove('active'));
      tab.classList.add('active');
      document.querySelector('#settingsProfile').classList.toggle('hidden', tab.dataset.tab !== 'profile');
      document.querySelector('#settingsAppearance').classList.toggle('hidden', tab.dataset.tab !== 'appearance');
      document.querySelector('#settingsActivity').classList.toggle('hidden', tab.dataset.tab !== 'activity');
      document.querySelector('#settingsAdvanced').classList.toggle('hidden', tab.dataset.tab !== 'advanced');
    });
  });

  ['settingTheme', 'settingDensity', 'settingFontSize', 'settingCompactSidebar', 'settingShowMessageTimes', 'settingReduceMotion', 'settingNotifications', 'settingSound', 'settingReadReceipts', 'settingLastSeen']
    .forEach((id) => {
      document.querySelector(`#${id}`).addEventListener('change', () => saveSettings());
    });

  document.querySelector('#settingStatus').addEventListener('change', async (event) => {
    const updated = await apiRequest('/api/presence', {
      method: 'POST',
      body: JSON.stringify({ status: event.target.value })
    });
    state.currentUser = updated;
    renderProfile();
    loadActivePeople();
  });

  socket.on('connect', () => {
    if (state.currentUserId) {
      socket.emit('register_user', state.currentUserId);
    }
  });

  socket.on('message_received', async (payload) => {
    const { conversationId } = payload;
    if (state.activeConversationId === conversationId) {
      const active = state.conversations.find((item) => item.id === conversationId);
      if (active) {
        active.messages.push(payload.message);
        active.updatedAt = payload.message.createdAt;
        renderMessages(active);
        await loadConversations();
      }
    } else {
      await loadConversations();
    }
  });

  socket.on('message_updated', async ({ conversationId }) => {
    if (state.activeConversationId === conversationId) await loadConversations();
  });

  socket.on('typing_status', ({ conversationId, userId, isTyping }) => {
    if (conversationId !== state.activeConversationId || userId === state.currentUserId) return;

    state.typingByUser[userId] = isTyping;
    const activeTypers = Object.keys(state.typingByUser).filter((uid) => state.typingByUser[uid]);
    els.typingStatus.textContent = activeTypers.length ? `${state.users.find((user) => user.id === activeTypers[0])?.name || 'Someone'} is typing...` : '';
  });

  socket.on('presence_update', ({ userId, status }) => {
    const target = state.users.find((user) => user.id === userId);
    if (target) {
      target.status = status;
    }
    if (state.currentUser?.id === userId) {
      state.currentUser.status = status;
      renderProfile();
    }
    renderConversationList();
    loadActivePeople();
  });

  socket.on('active_people', (people) => {
    state.activePeople = people;
    renderActivePeople(people);
  });

  socket.on('read_receipt', async ({ conversationId }) => {
    if (state.activeConversationId === conversationId) {
      await loadConversations();
    }
  });
}

async function bootstrap() {
  bindEvents();
  if (!state.token) {
    showAuth();
    return;
  }

  try {
    const me = await apiRequest('/api/auth/me');
    await enterApp(me);
  } catch (error) {
    showAuth();
  }
}

bootstrap();
