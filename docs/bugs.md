## 1. Ao trocar a semana dentro do aplicativo, o loading fica por tempo demais
O loading que fica na tela, fica por tempo demais, porém, se clicar em algum botão dentro do aplicativo, o loading some e aparece os dados.
Sem pressionar nada = Loading longo
Pressionando algum botão dentro do ap = Loading curto

**Resolvido em 2026-11-23:** o Angular 21 iniciava o app sem zone.js; a tela só
redesenhava em eventos de clique. Corrigido com provideZoneChangeDetection no PlaidModule.
