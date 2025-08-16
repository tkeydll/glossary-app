// Cosmos 対応フロントエンドスクリプト
// 旧 script-sqlite.js の代替。単純な CRUD + 検索 + AI フック

(function(){
  const apiBase = (window.API_CONFIG && window.API_CONFIG.cosmos.baseURL) || 'http://localhost:3001/api';

  // DOM 取得
  const termInput = document.getElementById('termInput');
  const tagsInput = document.getElementById('tagsInput');
  const addForm = document.getElementById('addTermForm');
  const termsList = document.getElementById('termsList');
  const noTermsMessage = document.getElementById('noTermsMessage');
  const searchInput = document.getElementById('searchInput');
  const tagFilter = document.getElementById('tagFilter');
  const clearTagFilter = document.getElementById('clearTagFilter');
  const enableAIForThisTerm = document.getElementById('enableAIForThisTerm');
  // 表示切替ボタン
  const cardViewBtn = document.getElementById('cardViewBtn');
  const listViewBtn = document.getElementById('listViewBtn');

  // 編集モーダル関連
  const editModal = document.getElementById('editModal');
  const editTermName = document.getElementById('editTermName');
  const editTermTags = document.getElementById('editTermTags');
  const editTermDescription = document.getElementById('editTermDescription');
  const editTermForm = document.getElementById('editTermForm');
  const deleteTermBtn = document.getElementById('deleteTerm');
  const regenerateAIBtn = document.getElementById('regenerateAI');
  const closeModalBtn = document.getElementById('closeModal');
  const cancelEditBtn = document.getElementById('cancelEdit');

  let currentTerms = [];
  let filteredTerms = [];
  let editingTermId = null;
  let searchTimer = null;
  let tagFilterTimer = null;
  let viewMode = (localStorage.getItem('viewMode') === 'list') ? 'list' : 'grid';

  function show(el){ if(el) el.style.display='block'; }
  function hide(el){ if(el) el.style.display='none'; }

  // タグ関連のヘルパー関数
  function parseTagsFromCategory(category) {
    if (!category) return [];
    return category.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
  }

  function formatTagsToCategory(tags) {
    if (!Array.isArray(tags)) return '';
    return tags.filter(tag => tag.trim().length > 0).map(tag => tag.trim()).join(', ');
  }

  function parseTagsFromInput(input) {
    if (!input) return [];
    return input.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
  }

  function renderTags(tags) {
    if (!tags || tags.length === 0) return '';
    return tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
  }

  function nodeGrid(t){
    const div = document.createElement('div');
    div.className = 'term-card';
    const tags = parseTagsFromCategory(t.category);
    div.innerHTML = `
      <div class="term-info">
        <div class="term-name">${escapeHtml(t.name)}</div>
        <div class="term-description">${t.description ? escapeHtml(t.description) : '<span class="no-description">説明なし</span>'}</div>
        ${tags.length > 0 ? `<div class="term-tags">${renderTags(tags)}</div>` : ''}
      </div>
      <div class="term-actions">
        <button class="edit-btn" data-id="${t.id}">編集</button>
        <button class="delete-btn" data-id="${t.id}">削除</button>
      </div>`;
    return div;
  }

  function nodeList(t){
    const div = document.createElement('div');
    div.className = 'term-card';
    const tags = parseTagsFromCategory(t.category);
    div.innerHTML = `
      <div class="term-content">
        <div class="term-info">
          <div class="term-name">${escapeHtml(t.name)}</div>
          <div class="term-description">${t.description ? escapeHtml(t.description) : '<span class="no-description">説明なし</span>'}</div>
          ${tags.length > 0 ? `<div class="term-tags">${renderTags(tags)}</div>` : ''}
        </div>
      </div>
      <div class="term-actions">
        <button class="edit-btn" data-id="${t.id}">編集</button>
        <button class="delete-btn" data-id="${t.id}">削除</button>
      </div>`;
    return div;
  }

  function applyContainerClass(){
    if(!termsList) return;
    termsList.classList.remove('terms-grid','terms-list');
    termsList.classList.add(viewMode === 'list' ? 'terms-list' : 'terms-grid');
  }

  function render(){
    if(!termsList) return;
    applyContainerClass();
    termsList.innerHTML='';
    const termsToRender = filteredTerms.length > 0 || tagFilter?.value || searchInput?.value ? filteredTerms : currentTerms;
    if(!termsToRender.length){ show(noTermsMessage); return; } else hide(noTermsMessage);
    const maker = viewMode === 'list' ? nodeList : nodeGrid;
    termsToRender.forEach(t=> termsList.appendChild(maker(t)));
  }

  function applyFilters(){
    let filtered = [...currentTerms];
    
    // 検索フィルタ
    const searchQuery = searchInput?.value?.trim()?.toLowerCase();
    if (searchQuery) {
      filtered = filtered.filter(t => 
        t.name.toLowerCase().includes(searchQuery) || 
        t.description.toLowerCase().includes(searchQuery)
      );
    }
    
    // タグフィルタ
    const tagQuery = tagFilter?.value?.trim()?.toLowerCase();
    if (tagQuery) {
      filtered = filtered.filter(t => {
        const tags = parseTagsFromCategory(t.category);
        return tags.some(tag => tag.toLowerCase().includes(tagQuery));
      });
    }
    
    filteredTerms = filtered;
    render();
  }

  function setViewMode(mode){
    viewMode = (mode === 'list') ? 'list' : 'grid';
    localStorage.setItem('viewMode', viewMode);
    // ボタンの状態
    cardViewBtn?.classList.toggle('active', viewMode === 'grid');
    listViewBtn?.classList.toggle('active', viewMode === 'list');
    render();
  }

  async function fetchTerms(){
    const res = await fetch(`${apiBase}/terms`);
    const data = await res.json();
    currentTerms = (data.terms||[]).sort((a,b)=>a.name.localeCompare(b.name,'ja'));
    applyFilters();
  }

  async function addTerm(name, tags = []){
    const category = formatTagsToCategory(tags);
    const body = { name, category };
    const res = await fetch(`${apiBase}/terms`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if(!res.ok){ const e = await res.json().catch(()=>({})); throw new Error(e.message || '追加失敗'); }
    const { term } = await res.json();
    currentTerms.push(term);
    currentTerms.sort((a,b)=>a.name.localeCompare(b.name,'ja'));
    applyFilters();
    if(enableAIForThisTerm && enableAIForThisTerm.checked && window.AI_API_CONFIG?.enableAIExplanation){
      try { await generateAIExplanation(term.id, term.name); } catch(e){ console.warn('AI生成失敗', e); }
    }
  }

  async function updateTerm(id, { description, category }){
    const res = await fetch(`${apiBase}/terms/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ description, category })});
    if(!res.ok){ const e = await res.json().catch(()=>({})); throw new Error(e.message||'更新失敗'); }
    const { term } = await res.json();
    const idx = currentTerms.findIndex(t=>t.id===id); if(idx>-1) currentTerms[idx]=term; applyFilters();
  }

  async function deleteTerm(id){
    const res = await fetch(`${apiBase}/terms/${id}`, { method:'DELETE' });
    if(res.status!==204){ console.warn('削除失敗?'); }
    currentTerms = currentTerms.filter(t=>t.id!==id); applyFilters();
  }

  async function searchTerms(q){
    // We'll use local filtering instead of server-side search for better tag integration
    applyFilters();
  }

  async function generateAIExplanation(id, name){
    // Azure Functions の GaiAoaiProxy を直接コール
    const endpoint = window.AI_API_CONFIG?.useProxy ? window.AI_API_CONFIG.proxyApiUrl : window.AI_API_CONFIG.directApiUrl;
    if(!endpoint){ console.log('AIエンドポイント未設定'); return; }
  const systemPrompt = window.AI_API_CONFIG?.systemPrompt ||
    'あなたは用語集の説明を行うアシスタントです。出力は必ず日本語の平文のみで、Markdownや箇条書き、装飾記号は使わないでください。対象はIT用語に限定し、非IT用語は「この用語はIT用語ではないため登録できません」とだけ返してください。IT用語の場合は一言サマリの1文だけを返してください。余計な前置きや例、関連語は出さないでください。';
    const userPrompt = `用語: ${name}`;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_prompt: systemPrompt,
          user_prompt: userPrompt,
          temperature: window.AI_API_CONFIG.defaultTemperature,
          top_p: window.AI_API_CONFIG.defaultTopP,
          frequency_penalty: window.AI_API_CONFIG.defaultFrequencyPenalty,
          presence_penalty: window.AI_API_CONFIG.defaultPresencePenalty
        })
      });
      if(!res.ok){
        const errTxt = await res.text().catch(()=> '');
        throw new Error(`AI API失敗: ${res.status} ${errTxt}`);
      }
      const data = await res.json();
      const text = data.explanation || data.output || data.text || '';
      if(text){ await updateTerm(id, { description: text, category: '' }); }
    } catch(e){ console.warn('AI説明生成エラー', e.message); }
  }

  // Event Listeners
  addForm?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const name = termInput.value.trim();
    const tags = parseTagsFromInput(tagsInput?.value || '');
    if(!name) return;
    termInput.disabled = true;
    try { 
      await addTerm(name, tags); 
      termInput.value=''; 
      if(tagsInput) tagsInput.value = '';
    }
    catch(err){ alert(err.message); }
    finally { termInput.disabled=false; }
  });

  termsList?.addEventListener('click', (e)=>{
    const btn = e.target.closest('button'); if(!btn) return;
    const id = btn.getAttribute('data-id');
    if(btn.classList.contains('edit-btn')){
      const term = currentTerms.find(t=>t.id===id); if(!term) return;
      editingTermId = id;
      editTermName.value = term.name;
      editTermDescription.value = term.description || '';
      if(editTermTags) {
        const tags = parseTagsFromCategory(term.category);
        editTermTags.value = tags.join(', ');
      }
      show(editModal);
    } else if(btn.classList.contains('delete-btn')){
      if(confirm('本当に削除しますか?')) deleteTerm(id); }
  });

  editTermForm?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(!editingTermId) return;
    const tags = parseTagsFromInput(editTermTags?.value || '');
    const category = formatTagsToCategory(tags);
    try { await updateTerm(editingTermId, { description: editTermDescription.value, category }); hide(editModal); }
    catch(err){ alert(err.message); }
  });

  deleteTermBtn?.addEventListener('click', async ()=>{
    if(!editingTermId) return; if(!confirm('削除します。よろしいですか?')) return; await deleteTerm(editingTermId); hide(editModal);
  });

  regenerateAIBtn?.addEventListener('click', async ()=>{
    if(!editingTermId) return; const term = currentTerms.find(t=>t.id===editingTermId); if(!term) return; editTermDescription.value='(AI生成中...)'; await generateAIExplanation(term.id, term.name); const refreshed = currentTerms.find(t=>t.id===term.id); editTermDescription.value = refreshed?.description || ''; });

  closeModalBtn?.addEventListener('click', ()=> hide(editModal));
  cancelEditBtn?.addEventListener('click', ()=> hide(editModal));

  searchInput?.addEventListener('input', ()=>{
    clearTimeout(searchTimer);
    searchTimer = setTimeout(()=> applyFilters(), 250);
  });

  tagFilter?.addEventListener('input', ()=>{
    clearTimeout(tagFilterTimer);
    tagFilterTimer = setTimeout(()=> applyFilters(), 250);
  });

  clearTagFilter?.addEventListener('click', ()=>{
    if(tagFilter) tagFilter.value = '';
    applyFilters();
  });

  // 表示切替イベント
  cardViewBtn?.addEventListener('click', ()=> setViewMode('grid'));
  listViewBtn?.addEventListener('click', ()=> setViewMode('list'));

  function escapeHtml(str){ return str.replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }

  // 初期状態
  setViewMode(viewMode); // ボタン状態とクラス反映
  fetchTerms().catch(e=> console.error('初期ロード失敗', e));
})();
