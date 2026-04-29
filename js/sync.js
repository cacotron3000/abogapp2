(function(){
  const API_BASE = localStorage.getItem('sync_api_base') || '/backend/api.php';
  const API_KEY = localStorage.getItem('sync_api_key') || 'dYNcXEgHBE7InHUJUknl6CF28zIlQJt8';

  async function req(action, table=null, method='GET', body=null){
    const u = new URL(API_BASE, window.location.origin);
    u.searchParams.set('action', action);
    if(table) u.searchParams.set('table', table);
    const res = await fetch(u.toString(), {
      method,
      headers: { 'Content-Type':'application/json', 'x-api-key': API_KEY },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json();
    if(!res.ok || data.ok === false) throw new Error(data.error || 'Error de sincronización');
    return data;
  }

  window.SyncAPI = {
    pulltabla: (table) => req('pull_table', table),
    pullall: () => req('pull_all'),
    pushtabla: (table, rows) => req('push_table', table, 'POST', { rows }),
    pushregistro: (table, row) => req('push_record', table, 'POST', { row }),
    deleteregistro: (table, id) => req('delete_record', table, 'POST', { id })
  };
})();
