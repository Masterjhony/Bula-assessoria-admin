'use client'

import { useEffect } from 'react'
import { firePendingLeadConversion } from '../_lib/analytics'

// Dispara o evento de conversão (touros_lead) no dataLayer ao montar a página de
// obrigado — de lá o GTM aciona a tag de Meta Lead / GA4 generate_lead. Só
// dispara se houver conversão REAL guardada no submit do form (ver analytics);
// um hit direto na URL não conta. Renderiza null (só efeito colateral).
export function LeadConversion() {
  useEffect(() => {
    firePendingLeadConversion()
  }, [])
  return null
}
