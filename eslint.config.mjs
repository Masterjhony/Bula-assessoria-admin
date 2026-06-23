import next from 'eslint-config-next/core-web-vitals'

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'node_modules/**',
      'next-env.d.ts',
      'public/**',
      'scripts/**',
      'jmp-landing/**',
      // Sub-projeto Node separado (gateway WhatsApp) — não é o app Next.
      'whatsapp-crm-server/**',
    ],
  },
  ...next,
  {
    rules: {
      // Regras NOVAS do eslint-plugin-react-hooks (React Compiler) que vieram
      // com o Next 16. O código atual não foi escrito sob elas e disparam em
      // padrões pré-existentes válidos — mantidas como aviso durante a migração.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      // Puramente cosmética (escapar aspas em texto JSX) — aviso, não erro.
      'react/no-unescaped-entities': 'warn',
    },
  },
]

export default eslintConfig
