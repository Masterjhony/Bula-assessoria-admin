---
phase: "01-09"
title: "ApartamentoGallery — Correcao de Enquadramento de Fotos"
status: draft
date: 2026-06-08
author: gsd-ui-researcher
component: src/components/ApartamentoGallery.tsx
---

# UI-SPEC: Correcao de Enquadramento da Galeria

## Problema diagnosticado

Todas as 8 fotos do apartamento sao arquivos JPEG convertidos de Canon RAW com dimensoes
exatas de **1400x933px**, razao 1.501 — isso e proporcao **3:2**, nao 4:3.

O container atual usa `aspect-[4/3]` (razao 1.333). Como o container e mais estreito do que
a foto em proporcao, `object-cover` precisou ampliar a imagem verticalmente para preencher.
O resultado e que a imagem ocupa toda a largura mas e cortada em cima e embaixo,
deslocando o sujeito (gado) para fora do enquadramento visivel.

```
Container 4:3  = largura 100%, altura = 75% da largura
Foto 3:2       = largura 100%, altura = 66.6% da largura

object-cover escala ate preencher o container:
  - a imagem fica 12% mais alta que o necessario
  - o excesso e cortado simetricamente topo/base
  - com object-position: center (padrao), o sujeito some se nao estiver
    exatamente no meio vertical
```

Para fotos de campo onde o gado ocupa o centro-inferior do quadro e o ceu/
vegetacao ocupa o topo, o corte simetrico e especialmente destrutivo.

---

## Decisao: proporcao nativa 3:2

**Usar `aspect-[3/2]` no container** — alinha exatamente com a proporcao das
fotos. Isso elimina o corte e o `object-cover` opera sem ampliar a imagem
nem remover conteudo.

### Trade-offs analisados

| Opcao | Comportamento | Decisao |
|---|---|---|
| `aspect-[3/2]` + `object-cover` | Container corresponde ao asset; sem corte; grid alinhado | **ADOTAR** |
| `aspect-[4/3]` + `object-cover` | Corte vertical de 12%; sujeito pode ser cortado | Rejeitar — causa o bug relatado |
| `aspect-[4/3]` + `object-position: top` | Ancora topo; gado que aparece no meio ainda e cortado | Rejeitar — paliativo fragil; depende de cada foto |
| `aspect-[16/9]` + `object-cover` | Container mais largo; corte horizontal pesado nas laterais | Rejeitar — pior que o atual |
| `object-contain` + fundo neutro | Foto inteira visivel; barras laterais aparecem (letterbox) | Rejeitar — aparencia amadora; inconsistente no grid |
| Sem aspect-ratio (altura automatica) | Cada foto expande com altura natural; grid desalinhado | Rejeitar — quebra alinhamento entre cards |

### Por que 3:2 e a resposta certa

- Proporcao e uma propriedade mensuravel do asset, nao uma opinia.o de design.
  Todos os 8 assets sao 1400x933 = 3:2 exato (1.501). Usar qualquer outro ratio
  introduz corte artificial.
- `object-cover` com container 3:2 sobre foto 3:2 resulta em escala 1:1 — a
  imagem preenche o container sem ampliar nenhum eixo.
- O grid continua alinhado porque todos os cards tem o mesmo aspect-ratio.
- Sem CLS: o container reserva espaco proporcional antes da imagem carregar.

---

## Contrato visual resultante

### Container do card

Substituir `aspect-[4/3]` por `aspect-[3/2]` em todo lugar onde aparece no
componente. Nenhuma outra propriedade muda.

```
ANTES: <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-neutral-800">
DEPOIS: <div className="relative aspect-[3/2] w-full overflow-hidden rounded-xl bg-neutral-800">
```

A unica mudanca de classe e `aspect-[4/3]` → `aspect-[3/2]`.

### Imagem dentro do card

`object-cover` permanece. Com o container agora 3:2 e o asset 3:2, o browser
nao precisa ampliar nem cortar.

```
<img
  src={foto.src}
  alt={foto.alt}
  width="1400"
  height="933"
  loading="lazy"
  decoding="async"
  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
/>
```

Adicionar `width="1400" height="933"` a cada `<img>` da galeria para prevenir
CLS — o browser calcula a altura do elemento antes do asset carregar.

### Placeholder de estado vazio

O placeholder usa o mesmo container. Deve mudar de `aspect-[4/3]` para
`aspect-[3/2]` para manter consistencia visual.

### Lightbox

O lightbox exibe a foto com `object-contain` dentro de `max-h-[90vh]
max-w-[90vw]` — nao e afetado pela mudanca de aspect-ratio do grid.
Nenhuma alteracao necessaria no lightbox.

---

## Specs de grid e espacamento (herdadas do 01-08-UI-SPEC.md)

Sem mudancas. Apenas documenta que todos os valores abaixo continuam validos
apos a correcao de aspect-ratio.

| Breakpoint | Colunas | Gap |
|---|---|---|
| mobile (< 640px) | 1 | 16px (`gap-4`) |
| tablet (640–1023px) | 2 | 20px (`sm:gap-5`) |
| desktop (>= 1024px) | 3 | 20px (`sm:gap-5`) |

Classe do grid: `grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3`

---

## Fichas de estado completas

### Estado: foto real (post-fix)

```tsx
<button
  type="button"
  onClick={() => setLightboxIndex(idx)}
  className="group relative overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
  aria-label={`Abrir foto: ${foto.alt}`}
>
  <div className="relative aspect-[3/2] w-full overflow-hidden rounded-xl bg-neutral-800">
    <img
      src={foto.src}
      alt={foto.alt}
      width="1400"
      height="933"
      loading="lazy"
      decoding="async"
      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
    />
    <div className="absolute inset-0 flex items-end bg-black/0 transition-all duration-200 group-hover:bg-black/45">
      {foto.caption && (
        <p className="translate-y-2 px-4 pb-4 text-sm font-medium text-white opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
          {foto.caption}
        </p>
      )}
    </div>
  </div>
</button>
```

### Estado: vazio (post-fix)

```tsx
<div className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-white/5 py-20 text-white/30">
  <Camera className="mb-4 h-12 w-12" aria-hidden />
  <p className="text-base font-medium">Fotos em breve</p>
</div>
```

O estado vazio usa `py-20` (padding fixo), nao aspect-ratio — correto e sem
alteracao necessaria.

---

## Atributos width/height obrigatorios

Todo `<img>` da galeria (thumbnail no grid) deve carregar com dimensoes
declaradas. O browser usa esses valores para reservar espaco antes do download
da imagem, eliminando CLS (Content Layout Shift).

| Atributo | Valor | Fonte |
|---|---|---|
| `width` | `1400` | Largura real do asset em px |
| `height` | `933` | Altura real do asset em px |

Se no futuro novos assets tiverem dimensoes diferentes, atualizar esses valores
para o novo par. A proporcao resultante (`width/height`) deve sempre corresponder
ao `aspect-[N/M]` do container.

---

## Regra de manutencao futura

Se fotos novas forem adicionadas ao array `FOTOS` com proporcao diferente (ex:
portrait ou 16:9), a equipe deve:

1. Identificar a proporcao do novo lote (ex: `file` ou PIL no terminal).
2. Atualizar `aspect-[3/2]` para a proporcao correta do novo lote, OU
3. Criar dois grupos no grid com proporcoes diferentes (mais complexo — evitar
   enquanto todos os assets forem homogeneos).

Nao adicionar fotos de proporcao diferente sem ajustar o container.

---

## Resumo das alteracoes no codigo

| Arquivo | Linha | De | Para |
|---|---|---|---|
| `src/components/ApartamentoGallery.tsx` | 79 | `aspect-[4/3]` | `aspect-[3/2]` |
| `src/components/ApartamentoGallery.tsx` | 80-84 | `<img ... />` sem width/height | `<img width="1400" height="933" decoding="async" ... />` |

Total: 1 arquivo, 1 mudanca de classe, 2 atributos adicionados ao `<img>`.
Nenhuma logica, nenhum estado, nenhuma dependencia nova.

---

## Verificacao pos-implementacao

- [ ] Grid renderiza sem barras pretas nas laterais dos cards
- [ ] Gado aparece completo e centralizado em todos os 8 cards
- [ ] Nenhum card apresenta corte vertical excessivo
- [ ] Lightbox continua funcionando sem alteracao (object-contain, max-h/w intactos)
- [ ] `npx tsc --noEmit` sem novos erros
- [ ] No Lighthouse/WebVitals: CLS = 0 (width/height declarados)
- [ ] Grid alinhado: todos os cards na mesma linha tem a mesma altura
- [ ] Hover: scale-[1.02] visivel, caption aparece sem cortes

---

## Propriedades invariantes (nao alterar)

As seguintes propriedades do 01-08-UI-SPEC.md permanecem sem mudanca:

- Tokens de cor: `bg-neutral-950`, `bg-neutral-800`, `text-white`, `text-white/55`, `text-white/40`
- Tipografia: heading `text-3xl font-black`, eyebrow `text-[11px] font-bold`, subtitulo `text-base text-white/55`
- Espacamento da secao: `py-14 sm:py-20 px-5 sm:px-8`
- Lightbox: `fixed inset-0 z-50 bg-black/90`, botao X `h-11 w-11` (44px touch target)
- Animacoes: apenas `transform` e `opacity`, 200ms
- Acessibilidade: `loading="lazy"`, `role="dialog"`, `aria-modal="true"`, `alt` descritivo
- Copywriting: "O Apartamento foi feito pela Bula", "Fotos em breve", "Prova social · Expertise em campo"
