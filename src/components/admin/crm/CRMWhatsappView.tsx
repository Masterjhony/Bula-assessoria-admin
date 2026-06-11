'use client';

import { MessageCircle } from 'lucide-react';
import { ConexaoTab } from '@/components/admin/central-whatsapp/ConexaoTab';

export function CRMWhatsappView() {
    return (
        <div className="max-w-5xl space-y-4 pb-8">
            <div className="flex items-center gap-2 text-xs text-gray-500">
                <MessageCircle size={14} />
                <span>Sessão WhatsApp usada pelo CRM e pelos encaminhamentos aos usuários da equipe.</span>
            </div>
            <ConexaoTab />
        </div>
    );
}
