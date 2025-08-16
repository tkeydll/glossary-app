// Gateway server: serves static assets + reverse proxy to internal API & AI proxy
// Exposed externally on port 8080 in Azure Container Apps.

const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const GATEWAY_PORT = process.env.GATEWAY_PORT || process.env.STATIC_PORT || 8080;
const API_INTERNAL = `http://127.0.0.1:${process.env.PORT || 3001}`;
// const AI_INTERNAL = `http://127.0.0.1:${process.env.PROXY_PORT || 3002}`; // proxy経路は廃止

// Basic health
app.get('/health', (_req,res)=>res.json({ status:'ok', gateway:true, timestamp:new Date().toISOString() }));

// Reverse proxy rules (AI 経路は廃止 /api のみ維持)
// Preserve /api prefix (Express strips mount path before forwarding), so manually re-prepend
app.use('/api', (req,res,next)=>{ const orig = req.url; req.url = '/api' + req.url; console.log(`[GW→API] ${req.method} ${req.originalUrl} -> forwarded ${req.url}`); next(); }, createProxyMiddleware({ target: API_INTERNAL, changeOrigin: false }));

// Static files (index.html root)
app.use(express.static(path.join(__dirname)));

// SPA fallback (if needed)
app.get('*', (req,res)=>{
  if (req.path.startsWith('/api')) return res.status(404).json({ error:'NotFound'});
  res.sendFile(path.join(__dirname,'index.html'));
});

app.listen(GATEWAY_PORT, ()=>{
  console.log(`🌐 Gateway listening on :${GATEWAY_PORT} -> API ${API_INTERNAL}`);
});
