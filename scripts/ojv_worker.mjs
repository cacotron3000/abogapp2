#!/usr/bin/env node
// Worker base para automatización autenticada OJV (Playwright).
// Requiere: npm i playwright

async function main(){
  const raw = process.argv[2] || '{}';
  const input = JSON.parse(raw);
  const { action, credentials, rit, rol } = input;
  if(!credentials?.username || !credentials?.password){
    return console.log(JSON.stringify({ ok:false, error:'Credenciales OJV no configuradas' }));
  }

  let chromium;
  try{
    ({ chromium } = await import('playwright'));
  }catch(_e){
    return console.log(JSON.stringify({ ok:false, error:'Playwright no instalado. Ejecuta: npm i playwright' }));
  }

  const browser = await chromium.launch({ headless:true });
  const page = await browser.newPage();
  try{
    // TODO: Ajustar selectores reales OJV
    await page.goto('https://oficinajudicialvirtual.pjud.cl/', { waitUntil:'domcontentloaded' });

    if(action === 'auth_test'){
      // Placeholder: flujo real de login debe mapear selectores de usuario/clave/botón.
      return console.log(JSON.stringify({ ok:true, message:'Worker operativo. Falta mapear login OJV real.' }));
    }

    if(action === 'sync_causa'){
      // Placeholder de extracción. Aquí debes navegar y consultar por RIT/ROL.
      const demo = {
        tribunal: '',
        estadoProcesal: '',
        etapa: '',
        proximaAudiencia: '',
        link: page.url(),
        rit: rit || '',
        rol: rol || ''
      };
      return console.log(JSON.stringify({ ok:true, causa: demo }));
    }

    return console.log(JSON.stringify({ ok:false, error:'Acción no soportada' }));
  }catch(err){
    return console.log(JSON.stringify({ ok:false, error: String(err?.message || err) }));
  }finally{
    await browser.close();
  }
}

main();
