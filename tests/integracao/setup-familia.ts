// 15 §4: os serviços chamados direto pelos testes rodam na família padrão (a mesma do bootstrap
// das fábricas); testes de isolamento usam comFamilia() com outra família.
import { definirFamiliaPadrao, FAMILIA_PADRAO } from '@/server/familia'

definirFamiliaPadrao(FAMILIA_PADRAO)
