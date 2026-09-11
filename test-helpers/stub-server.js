'use strict'; /*jslint node:true es9:true*/
import http from 'node:http';

export function start_stub_server(){
    const observed_requests = [];
    return new Promise(done=>{
        const server = http.createServer((req, res)=>{
            let body = '';
            req.on('data', chunk=>{ body += chunk; });
            req.on('end', ()=>{
                if (req.method=='GET'
                    && req.url.startsWith('/zone/get_active_zones'))
                {
                    res.writeHead(200, {'Content-Type': 'application/json'});
                    res.end(JSON.stringify([{name: 'mcp_unlocker'},
                        {name: 'mcp_browser'}]));
                    return;
                }
                if (req.method=='POST' && req.url=='/zone')
                {
                    res.writeHead(200, {'Content-Type': 'application/json'});
                    res.end('{}');
                    return;
                }
                if (req.method=='GET' && req.url.startsWith('/datasets/')
                    && req.url.endsWith('/metadata'))
                {
                    observed_requests.push({headers: req.headers,
                        body: null});
                    res.writeHead(400, {'Content-Type': 'application/json'});
                    res.end(JSON.stringify({error: 'dataset not found'}));
                    return;
                }
                if (req.method=='POST' && req.url=='/request')
                {
                    let parsed = {};
                    try { parsed = JSON.parse(body); } catch(e){ /* ignore */ }
                    observed_requests.push({headers: req.headers,
                        body: parsed});
                    const target_url = parsed.url || '';
                    if (target_url.includes('bad.example'))
                    {
                        res.writeHead(400, {'Content-Type': 'application/json'});
                        res.end(JSON.stringify({error: 'zone not found'}));
                        return;
                    }
                    res.writeHead(200, {'Content-Type': 'text/plain'});
                    res.end('# Example\n\nHello world.');
                    return;
                }
                res.writeHead(404);
                res.end();
            });
        });
        server.observed_requests = observed_requests;
        server.listen(0, '127.0.0.1', ()=>done(server));
    });
}

export function close_stub_server(server){
    return new Promise((resolve, reject)=>{
        server.close(error=>error ? reject(error) : resolve());
    });
}
