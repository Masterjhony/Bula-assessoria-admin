# Como conferir a landing de fêmeas

Quatro scripts. Nenhum precisa de credencial, de acesso ao GTM ou de deploy —
todos abrem a página num navegador de verdade e **anotam o que acontece**.

Antes de rodar qualquer um, o servidor tem que estar de pé:

```bash
npm run dev            # deixe rodando em outro terminal
```

---

## 1. A medição está funcionando?

```bash
node scripts/femeas/medir-medicao.mjs
```

Abre a landing e as duas páginas de obrigado e anota **tudo que sai pela rede**.

**Resultado esperado:**

| Rota | dataLayer e GA4 |
|---|---|
| `/obrigado-femeas-mql` | `femeas_mql` |
| `/obrigado-femeas-lead` | `femeas_lead` |
| `/femeas` | nenhum dos dois |

Se as páginas de obrigado mostrarem só `page_view`, **a conversão parou de
disparar** — provavelmente alguém removeu o `<ConversaoObrigado/>`.

> **Por que este teste existe:** em 06/08/2026 ele mostrou que as duas páginas de
> obrigado eram, para a medição, indistinguíveis da landing. A URL própria e a
> navegação hard estavam certas; faltava alguém empurrar o evento.

⚠️ **`Meta /tr: NENHUM` é esperado neste script e NÃO quer dizer tag quebrada.**
O `fbevents.js` não dispara em navegador **headless** — ele detecta automação.
Este script mede **GA4** de forma confiável; **o Meta, não**.

Para conferir o Meta, use o **Pixel Helper num navegador de gente** ou o **Testar
Eventos** do Gerenciador. Em 06/08/2026 o Pixel Helper confirmou `PageView`
ativo no pixel `1539780341180483` em `femeas.bulaassessoria.com` — depois de eu
ter concluído o contrário com este script. A história do erro está em
`.planning/femeas-perpetuo/TESTE-GTM-2026-08-06.md` §4-ter.

---

## 2. A mudança visual custou conversão?

```bash
node scripts/femeas/medir-pagina.mjs
```

Mede alturas, rolagem lateral e os invariantes estruturais, e **compara com a
referência** conhecida.

**O número que importa é o `primeiroCampo`:** a distância do topo até o primeiro
campo do formulário no celular. Hoje são **640px** numa tela de 844 — o
`/touros`, que é o análogo, faz 633. Se esse número **cresce**, a pessoa precisa
rolar mais para começar a preencher, e isso se paga em conversão. O script marca
com ⚠️ quando piora.

Ele também reprova se:

- houver mais de um `<form>` na página (os eventos do funil contariam dobrado);
- sumir algum dos 6 cartões de categoria do DOM (o carrossel mostra um por vez,
  mas os seis continuam lá);
- sumir algum dos 9 critérios do filtro (5 de um lado, 4 do outro);
- a página passar a rolar de lado.

---

## 3. Alguma seção está "só texto"?

```bash
node scripts/femeas/medir-densidade.mjs
```

Mede, seção por seção, as duas metades da régua desta página:

> toda seção **ou** quebra **2,0×** de razão tipográfica (maior tipo ÷ 16px de
> corpo) **ou** carrega **≥3% de área não-texto**.

Seção que não faz nem um nem outro é a que o dono lê como *"muito texto, sem
respiro, pouco visual"*. Foi essa conta que achou o filtro (1,25× / 0,0%) e
depois a ficha técnica do hero (1,25× / 0,0%) — as duas **antes** de ele
reclamar de novo. Rode antes de escolher um tratamento visual e depois de
acrescentar seção nova.

⚠️ **A saída nem sempre é aumentar o tipo.** As duas metades valem igual: as
categorias passam por escala (2,50×, sem imagem nenhuma) e a assessoria passa
por diagrama (3,0%, com razão baixíssima).

⚠️ **`área não-texto` conta só `img`/`svg`/`video`** — a mesma conta da
auditoria, para as tabelas continuarem comparáveis. Bloco pintado não entra, e
por isso o `#fecho` (cuja âncora é o botão dourado preenchido) está na lista de
exceções dentro do script, não reprovando.

---

## 4. Ver a página inteira, seção por seção

```bash
node scripts/femeas/capturar-secoes.mjs
node scripts/femeas/capturar-secoes.mjs ~/Downloads/femeas    # escolhendo a pasta
```

Gera os prints de cada seção em celular (390) e desktop (1440).

⚠️ **A animação sai desligada de propósito** — senão a faixa de logos borra. O
efeito colateral já enganou uma revisão: **nos prints a faixa aparece parada, mas
ela passa sozinha na página de verdade.**

---

## O que estes scripts NÃO cobrem

1. **Aparelho real.** Tudo é Chromium via Playwright. O ponto provável de
   surpresa é o iOS Safari, onde `scroll-snap` e rolagem suave às vezes brigam —
   é o que vale testar num iPhone se for testar uma coisa só.
2. **Leitor de tela.** Dá para conferir DOM e ARIA, não a fala do VoiceOver.
3. **A planilha.** Nenhum destes envia formulário. Ver o roteiro de 6
   conferências em `.planning/femeas-perpetuo/EXECUCAO.md`.
4. **O Gerenciador de Eventos.** O script vê o que o navegador manda, não o que a
   plataforma registra.
