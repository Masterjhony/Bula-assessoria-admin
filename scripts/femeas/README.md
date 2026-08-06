# Como conferir a landing de fêmeas

Três scripts. Nenhum precisa de credencial, de acesso ao GTM ou de deploy —
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

⚠️ **`Meta /tr: NENHUM` é o estado conhecido, e não é culpa do nosso evento.** Em
06/08 o pixel não enviava nada em página nenhuma — nem na landing de produção de
touros, nem o `PageView` que o próprio container manda disparar. Enquanto isso
não for resolvido no Gerenciador de Eventos, **o GA4 é a única medição confiável
deste funil**. Detalhes em `.planning/femeas-perpetuo/TESTE-GTM-2026-08-06.md`.

---

## 2. A mudança visual custou conversão?

```bash
node scripts/femeas/medir-pagina.mjs
```

Mede alturas, rolagem lateral e os invariantes estruturais, e **compara com a
referência** conhecida.

**O número que importa é o `primeiroCampo`:** a distância do topo até o primeiro
campo do formulário no celular. Hoje são **950px** numa tela de 844 — o
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

## 3. Ver a página inteira, seção por seção

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
