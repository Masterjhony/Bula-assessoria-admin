---
projeto: web-bula — Landing do Leilão Touros São Geraldo e 7P
branch: feat/leilao-sao-geraldo
evento: sábado, 01/08/2026, 12h (horário de Brasília)
escrito_em: 27/07/2026
para: execução no Cowork, por quem TEM acesso às contas
---

# Plano de go-live — Leilão São Geraldo e 7P

## Como ler este documento

O **código está pronto e verificado**. O que falta é tudo em painel: domínio,
DNS e conversão. Nenhuma tarefa aqui pede para escrever código.

Faltam **4 dias** para o leilão. A ordem importa: a Tarefa 0 pode invalidar
todo o resto, e a Tarefa 1 é a de maior tempo de espera (propagação de DNS +
emissão de certificado).

**Regra geral:** onde este plano dá um valor de palpite, ele diz que é palpite.
Use o que a tela mostrar, nunca o palpite.

---

## Estado verificado em 27/07 — a linha de base

Tudo abaixo foi medido, não suposto. Se algum destes valores estiver diferente
quando você for executar, **pare e investigue** antes de seguir.

**Container do GTM — INTOCADO:**
```
GTM-K8RXFDDT · conta 6359934056 · container 254974309 · workspace 10
versão publicada: 9 | tags: 5 | acionadores: 4 | condições: 6
único acionador por URL: /obrigado-jmp.html  (funil JMP antigo)
```

**Meta:**
```
conta de anúncios: 2705134163151418
pixel CERTO:  1539780341180483  ("Pixel-Touro-Perpetuo") — ativo, disparou 27/07
ARMADILHA:    2063779524517301  ("Perpetuo TOUROS") — NUNCA disparou.
              Os nomes são quase iguais. Escolha pelo ID, nunca pelo nome.

conversões personalizadas que existem hoje (só duas):
  1411024464255046  "MQL Perpetuo Touros"
      PageView E URL i_contains "https://touros.bulaassessoria.com/obrigado-touros-mql"
  27199188126398754 "lead-leilao-jmp"
      PageView E URL i_contains "https://jmp.bulaassessoria.com/obrigado-jmp.html"
```

**O fato que simplifica tudo:** as duas regras trazem o **hostname inteiro**
dentro do `contains`. `saogeraldo.bulaassessoria.com` **não casa** com
`touros.bulaassessoria.com`. **Não existe colisão entre os funis.** Portanto:
nada a editar no perpétuo, nenhum risco de reiniciar aprendizado de campanha, e
**nenhuma alteração necessária no GTM**.

**DNS:**
```
saogeraldo.bulaassessoria.com → NXDOMAIN (dig vazio)          ← o bloqueio
touros.bulaassessoria.com     → CNAME b5c073c43bb3d852.vercel-dns-017.com
                                A 216.150.16.129 / 216.150.1.129
```

**Código (na branch `feat/leilao-sao-geraldo`):**
```
npm run build ......................... exit 0
npx tsc --noEmit ...................... limpo
sem dataLayer.push na landing ......... ok  (não aciona o catch-all do container)
window.location.assign, sem router.push  ok  (navegação hard = o PageView dispara)
GTM-K8RXFDDT nas 2 páginas de obrigado   ok  (confirmado no HTML servido)
sem disparo de WhatsApp ............... ok
```

---

## Tarefa 0 — Descobrir de onde a produção é construída (BLOQUEANTE)

**Faça isto primeiro.** Existe uma contradição não explicada, e ela pode
invalidar todo o resto do plano.

`src/app/route.ts` em `origin/main` serve `login.html` na raiz. Mas a produção
responde `308 → /agenda` no apex e faz rewrite → `/touros` no subdomínio.
**A produção não se comporta como o código de `origin/main`.**

A hipótese mais provável é que **o projeto na Vercel aponte para outro
repositório, outra branch ou outro Root Directory**. Se for isso, publicar a
branch `feat/leilao-sao-geraldo` neste repositório **não coloca a página no
ar** — e você só descobriria isso depois de queimar o DNS e o certificado.

Rode, numa conta com acesso ao projeto:

```bash
vercel projects ls
vercel project inspect <project>      # de qual repo/branch a produção sai
vercel domains ls
vercel inspect <url-de-producao>      # commit que gerou a produção
```

**Critério de aceite:** você consegue dizer, com o comando na mão, qual repo e
qual branch geram a produção. Se **não** for este repositório, pare e escale —
o código precisa ir para o repo certo antes de qualquer outra coisa.

---

## Tarefa 1 — Domínio e DNS (CAMINHO CRÍTICO — maior tempo de espera)

Sem isto, nada mais existe: a página não recebe tráfego, a conversão não tem o
que medir, e o Preview do GTM nem roda.

| # | Onde | Ação |
|---|---|---|
| 1 | Vercel → Project → Settings → Domains | Adicionar `saogeraldo.bulaassessoria.com` |
| 2 | Vercel, mesma tela | **Copiar o CNAME que a tela exibir.** Provavelmente `b5c073c43bb3d852.vercel-dns-017.com` (é o target do `touros`, mesmo projeto) — mas **use o que a tela mostrar** |
| 3 | Hostinger → DNS de `bulaassessoria.com` | Criar registro `CNAME`, nome `saogeraldo`, valor = passo 2, TTL padrão. **A zona é da Hostinger, não da Vercel** — `vercel dns add` não serve aqui |
| 4 | Vercel → Domains | Aguardar validação e emissão do certificado |
| 5 | Vercel | **Replicar a allowlist do `touros.*`** — ver abaixo |
| 6 | — | **Nenhuma variável de ambiente nova.** Ver o aviso no fim deste plano |

### O passo 5 é onde o lançamento morre em silêncio

O `touros.*` tem uma allowlist de paths: o que é da landing passa, o que é do
app interno leva 308 para a raiz. O `saogeraldo.*` precisa do equivalente:

```
/                            → rewrite para /saogeraldo
/saogeraldo
/obrigado-saogeraldo-mql     ← sem isto a conversão NUNCA dispara
/obrigado-saogeraldo-lead    ← idem
/api/saogeraldo/lead         ← sem isto o formulário não envia
/privacidade   /termos       ← links do rodapé
/_next/*   /saogeraldo/*     ← assets e imagens
```

**Por que "em silêncio":** se uma página de obrigado responder `308` em vez de
`200`, o navegador é levado para `/`, o PageView é registrado na URL errada, a
regra de conversão não casa — e **nada acusa erro em lugar nenhum**. O
formulário parece funcionar, o lead entra no CRM, e a campanha simplesmente
não tem conversão para otimizar. É a falha mais cara e mais discreta do projeto.

### Verificação da Tarefa 1

```bash
for p in / /obrigado-saogeraldo-mql /obrigado-saogeraldo-lead; do
  printf '\n--- %s\n' "$p"
  curl -sS -o /dev/null -D - "https://saogeraldo.bulaassessoria.com$p" \
    | grep -Ei '^(HTTP/|location:|x-matched-path:)'
done

curl -sS -o /dev/null -w '%{http_code}\n' -X POST \
  https://saogeraldo.bulaassessoria.com/api/saogeraldo/lead
```

**Aceite:** raiz **200** com `x-matched-path: /saogeraldo`; as duas de obrigado
**200**; a rota de API responde **400 ou 405** (é POST com corpo — o que
importa é que ela foi *alcançada*, não que passou). **Qualquer `location:` nas
três primeiras = reprovado**, volte ao passo 5.

---

## Tarefa 2 — As duas conversões no Events Manager (NÃO precisa de GTM)

Como não há colisão, este é o caminho inteiro. **Não se cria tag, não se cria
acionador, não se publica o container.** Risco zero para o perpétuo.

Pode ser feito **antes** do domínio estar no ar — a conversão fica criada
esperando o primeiro disparo. Aliás, criar cedo é melhor: o Meta precisa de
tempo para reconhecer o evento.

Events Manager → conta **2705134163151418** → Conversões personalizadas.

**Conversão 1 — a que importa para otimizar campanha:**
```
Nome:     SG7P — MQL
Origem:   pixel 1539780341180483   (confira o ID, não o nome)
Regra:    Evento = PageView
          E  URL contém  https://saogeraldo.bulaassessoria.com/obrigado-saogeraldo-mql
Valor:    deixe em branco
```

**Conversão 2 — volume total de cadastros:**
```
Nome:     SG7P — Lead
Origem:   pixel 1539780341180483
Regra:    Evento = PageView
          E  URL contém  https://saogeraldo.bulaassessoria.com/obrigado-saogeraldo-lead
Valor:    deixe em branco
```

**Copie o formato da `MQL Perpetuo Touros`:** URL **com `https://` e com o
hostname inteiro**. É justamente isso que mantém os funis separados. Uma regra
frouxa do tipo `contém /obrigado` casaria com o perpétuo e com o JMP, e
misturaria três funis num pixel só.

**Deixe o valor em branco de propósito.** O pixel é compartilhado com o
perpétuo; valor fixo aqui contamina o retorno reportado do outro funil.

> Observação: o perpétuo tem conversão **só de MQL** — não existe uma de lead
> comum. Então a `SG7P — MQL` sai de uma duplicata da `MQL Perpetuo Touros`
> trocando a URL, e a `SG7P — Lead` é criada do zero, no mesmo formato.

---

## Tarefa 3 — Verificação ponta a ponta (depois das Tarefas 1 e 2)

1. Abrir `https://saogeraldo.bulaassessoria.com` com o **Meta Pixel Helper**.
2. Preencher o formulário com **rebanho ≥ 100 cabeças e inscrição estadual =
   Sim** → tem que cair em `/obrigado-saogeraldo-mql`.
3. No Pixel Helper: **um** `PageView` na página de obrigado. **Um, não dois** —
   dois significa que alguém passou a empurrar evento ao `dataLayer` e acionou
   o catch-all do container.
4. Repetir com **rebanho de 1 a 99 cabeças** → tem que cair em
   `/obrigado-saogeraldo-lead`. Quem decide isso é o servidor, não o navegador.
5. Events Manager → as duas conversões novas registrando, e a
   `MQL Perpetuo Touros` **sem nenhum disparo novo vindo do São Geraldo**.
6. Conferir no CRM que o lead entrou com `source = leilao-sg7p` e que
   **`telefone` e `celular` estão os dois preenchidos** (o CRM lê `celular`
   como contato principal — sem ele o número não aparece ao abrir o lead).

---

## O que NÃO fazer — lista fechada

- **Não criar container do GTM, nem workspace novo.** Decisão do cliente,
  travada. E, com a colisão descartada, não há nem alteração de GTM a fazer.
- **Não publicar o container.** Publicar sobe o workspace 10 inteiro, incluindo
  trabalho de terceiros que possa estar pendente lá dentro. Se algum dia for
  mesmo necessário publicar, **inspecione a aba Alterações antes** e reporte o
  que houver que não seja seu.
- **Não editar a `MQL Perpetuo Touros`.** Ela está correta e está em produção.
- **Não mexer em `src/app/touros/` nem em `/api/touros/`.**
- **Não trocar o valor de `NEXT_PUBLIC_GTM_ID`.** Ela é **compartilhada** com o
  `/touros`. Mudar para "separar" o lançamento **derruba o tracking do perpétuo
  no mesmo instante**. Se um dia for preciso separar, cria-se uma variável
  nova — esta não se reaproveita.
- **Não criar `NEXT_PUBLIC_GTM_ID_SAOGERALDO`.** Um plano antigo pedia isso
  quando a recomendação era container novo. Está superado; hoje é só ruído.
- **Não usar evento padrão do Meta** (`Lead`, `CompleteRegistration`) para o
  leilão, caso alguém opte por criar tag no GTM depois. O pixel é compartilhado.

---

## Guarda de segurança — rode a qualquer momento

Prova de que o container não foi alterado. A configuração publicada é pública,
então isto roda de qualquer máquina, sem login:

```bash
python3 - <<'PY'
import json,re,urllib.request
s=urllib.request.urlopen("https://www.googletagmanager.com/gtm.js?id=GTM-K8RXFDDT",timeout=20).read().decode('utf8','replace')
d=json.loads(re.search(r'var data = (\{.*?\});\n',s,re.S).group(1))['resource']
print("versao:",d['version'],"tags:",len(d['tags']),"rules:",len(d['rules']),"preds:",len(d['predicates']))
for i,x in enumerate(d['rules']): print("rule",i,x)
for i,p in enumerate(d['predicates']): print("pred",i,p['function'],p.get('arg1'))
PY
```

**Esperado enquanto ninguém mexer no GTM:**
```
versao: 9 tags: 5 rules: 4 preds: 6
rule 0 [['if', 0], ['add', 0]]
rule 1 [['if', 1], ['add', 1, 2, 3]]
rule 2 [['if', 3], ['unless', 2], ['add', 2, 3]]
rule 3 [['if', 4, 5], ['add', 4]]
pred 0 _eq gtm.init | pred 1 _eq gtm.dom | pred 2 _cn gtm.
pred 3 _re .+       | pred 4 _cn /obrigado-jmp.html | pred 5 _eq gtm.js
```

Qualquer divergência nas rules 0–3 ou nas preds 0–5 significa que **algo do
perpétuo foi alterado** → rollback imediato para a versão anterior e investigar.

---

## Resumo em uma tela

| # | Tarefa | Quem destrava | Sem isso |
|---|---|---|---|
| 0 | Confirmar repo/branch da produção | acesso Vercel | o código pode nunca ir ao ar |
| 1 | Domínio + DNS + allowlist | acesso Vercel + Hostinger | página inacessível; nada mede |
| 2 | 2 conversões personalizadas | acesso Meta Business | capta lead que ninguém mede |
| 3 | Teste ponta a ponta | depende de 1 e 2 | sobe tráfego às cegas |

**Não depende de acesso ao GTM.** Aquele bloqueio deixou de existir quando a
colisão foi descartada.
