// Cosmos DB / In-memory hybrid API server for glossary terms
// Partition key: /id (simple, evenly distributed if UUIDs)
// Fallback: if Cosmos credentials absent or connection fails, uses in-memory store

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
let CosmosClient; // lazy require

const PORT = process.env.PORT || 3001;
const COSMOS_ENDPOINT = process.env.COSMOS_ENDPOINT;
const COSMOS_KEY = process.env.COSMOS_KEY;
// Accept legacy variable names (COSMOS_DATABASE / COSMOS_CONTAINER) for convenience
const COSMOS_DB_NAME = process.env.COSMOS_DB_NAME || process.env.COSMOS_DATABASE || 'glossary';
const COSMOS_CONTAINER_NAME = process.env.COSMOS_CONTAINER_NAME || process.env.COSMOS_CONTAINER || 'terms';
const COSMOS_THROUGHPUT = parseInt(process.env.COSMOS_THROUGHPUT || '400', 10);

let cosmosAvailable = false;
let cosmosClient, database, container;

const memoryStore = { terms: [] };

function nowIso() { return new Date().toISOString(); }
function normalizeName(name) { return name.trim().toLowerCase(); }
function buildTerm({ id = uuidv4(), name, description = '', category = '', isAIGenerated = false }) {
  const ts = nowIso();
  return { id, name: name.trim(), description: description || '', category: category || '', isAIGenerated: !!isAIGenerated, createdAt: ts, updatedAt: ts, type: 'term' };
}

async function initCosmos() {
  if (!COSMOS_ENDPOINT || !COSMOS_KEY) { console.warn('⚠️  Cosmos資格情報未設定: memoryモード'); return; }
  try {
    ({ CosmosClient } = require('@azure/cosmos'));
    cosmosClient = new CosmosClient({ endpoint: COSMOS_ENDPOINT, key: COSMOS_KEY });
    const { database: db } = await cosmosClient.databases.createIfNotExists({ id: COSMOS_DB_NAME });
    database = db;
    const { container: cont } = await database.containers.createIfNotExists({ id: COSMOS_CONTAINER_NAME, partitionKey: { kind: 'Hash', paths: ['/id'] } }, { offerThroughput: COSMOS_THROUGHPUT });
    container = cont;
    cosmosAvailable = true;
    console.log(`✅ Cosmos 初期化完了 DB='${COSMOS_DB_NAME}' Container='${COSMOS_CONTAINER_NAME}'`);
  } catch (err) {
    cosmosAvailable = false;
    console.error('❌ Cosmos 初期化失敗 memoryモード継続:', err.message);
  }
}

async function findDuplicateName(name) {
  const lower = normalizeName(name);
  if (!cosmosAvailable) return memoryStore.terms.find(t => normalizeName(t.name) === lower) || null;
  const query = { query: 'SELECT TOP 1 c.id FROM c WHERE c.type = "term" AND LOWER(c.name) = @n', parameters: [{ name: '@n', value: lower }] };
  const { resources } = await container.items.query(query, { maxItemCount: 1 }).fetchAll();
  return resources[0] || null;
}
async function listTerms() { if (!cosmosAvailable) return [...memoryStore.terms].sort((a,b)=>a.name.localeCompare(b.name,'ja')); const { resources } = await container.items.query({ query: 'SELECT * FROM c WHERE c.type = "term"' }).fetchAll(); return resources.sort((a,b)=>a.name.localeCompare(b.name,'ja')); }
async function getTerm(id) { if (!cosmosAvailable) return memoryStore.terms.find(t=>t.id===id)||null; try { const { resource } = await container.item(id, id).read(); return resource; } catch(e){ if(e.code===404) return null; throw e; } }
async function createTerm(name) { const term = buildTerm({ name }); if (!cosmosAvailable) { memoryStore.terms.push(term); return term; } const { resource } = await container.items.create(term); return resource; }
async function updateTerm(id,{description='',category=''}) { if (!cosmosAvailable){ const idx=memoryStore.terms.findIndex(t=>t.id===id); if(idx===-1) return null; const updated={...memoryStore.terms[idx],description:description.trim(),category:category||'',updatedAt:nowIso(),isAIGenerated:false}; memoryStore.terms[idx]=updated; return updated;} const existing=await getTerm(id); if(!existing) return null; existing.description=description.trim(); existing.category=category||''; existing.updatedAt=nowIso(); existing.isAIGenerated=false; const { resource } = await container.items.upsert(existing); return resource; }
async function deleteTerm(id){ if(!cosmosAvailable){ const idx=memoryStore.terms.findIndex(t=>t.id===id); if(idx===-1) return false; memoryStore.terms.splice(idx,1); return true;} try{ await container.item(id,id).delete(); return true;}catch(e){ if(e.code===404) return false; throw e; }}
async function searchTerms(q){ const needle=q.trim().toLowerCase(); if(!needle) return listTerms(); if(!cosmosAvailable) return memoryStore.terms.filter(t=>t.name.toLowerCase().includes(needle)||t.description.toLowerCase().includes(needle)); const query={ query:'SELECT * FROM c WHERE c.type = "term" AND (CONTAINS(LOWER(c.name), @q, true) OR CONTAINS(LOWER(c.description), @q, true))', parameters:[{name:'@q',value:needle}]}; const { resources } = await container.items.query(query).fetchAll(); return resources; }

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req,res)=>{ res.json({ status:'ok', cosmos:cosmosAvailable, mode: cosmosAvailable?'cosmos':'memory', db: COSMOS_DB_NAME, container: COSMOS_CONTAINER_NAME, timestamp: nowIso()}); });
app.get('/api/terms', async (_req,res,next)=>{ try{ res.json({ terms: await listTerms() }); }catch(e){ next(e);} });
app.get('/api/terms/:id', async (req,res,next)=>{ try{ const term=await getTerm(req.params.id); if(!term) return res.status(404).json({error:'NotFound',message:'Term not found'}); res.json({ term }); }catch(e){ next(e);} });
app.post('/api/terms', async (req,res,next)=>{ try{ const { name, description='', category='' } = req.body||{}; if(!name||!name.trim()) return res.status(400).json({error:'ValidationError',message:'name is required'}); const dup=await findDuplicateName(name); if(dup) return res.status(409).json({error:'Conflict',message:'Term already exists'}); const term=await createTerm(name); if(description||category){ term.description=description; term.category=category; term.updatedAt=nowIso(); if(cosmosAvailable) await container.items.upsert(term);} res.status(201).json({ term }); }catch(e){ next(e);} });
app.put('/api/terms/:id', async (req,res,next)=>{ try{ const { description='', category='' } = req.body||{}; const updated=await updateTerm(req.params.id,{description,category}); if(!updated) return res.status(404).json({error:'NotFound',message:'Term not found'}); res.json({ term: updated }); }catch(e){ next(e);} });
app.delete('/api/terms/:id', async (req,res,next)=>{ try{ const ok=await deleteTerm(req.params.id); if(!ok) return res.status(404).json({error:'NotFound',message:'Term not found'}); res.status(204).send(); }catch(e){ next(e);} });
app.get('/api/search', async (req,res,next)=>{ try{ const q=(req.query.q||'').toString(); res.json({ terms: await searchTerms(q) }); }catch(e){ next(e);} });
app.use((err,_req,res,_next)=>{ console.error('💥 API Error:', err); const status = err.code===404?404:500; res.status(status).json({ error:'ServerError', message: err.message||'Unexpected error' }); });

initCosmos().finally(()=>{ app.listen(PORT, ()=>{ console.log(`🚀 Glossary API server http://localhost:${PORT} mode=${cosmosAvailable?'cosmos':'memory'}`); }); });
