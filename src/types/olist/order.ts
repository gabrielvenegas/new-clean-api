import type { OlistApiResponse } from "./api-response";
import type { OlistCustomer } from "./contact";

export interface OlistOrder {
  pedido: {
    id: string;
    numero: string;
    numero_ecommerce: number | string;
    data_pedido: string;
    data_prevista: string;
    data_faturamento: string;
    data_envio: string;
    data_entrega: string;
    id_lista_preco: string;
    descricao_lista_preco: string;
    cliente: OlistCustomer;
    itens: OlistOrderItem[];
    parcelas: OlistOrderInstallment[];
    condicao_pagamento: string;
    forma_pagamento: string;
    meio_pagamento: string;
    nome_transportador: string;
    frete_por_conta: string;
    valor_frete: string;
    valor_desconto: number;
    outras_despesas: string;
    total_produtos: string;
    total_pedido: string;
    numero_ordem_compra: string;
    deposito: string;
    forma_envio: string;
    situacao: string;
    obs: string;
    obs_interna: string;
    id_vendedor: string;
    codigo_rastreamento: string;
    url_rastreamento: string;
    id_nota_fiscal: string;
    id_natureza_operacao: string;
    valor: number;
  };
}

interface OlistOrderItem {
  item: Item;
}

export interface Item {
  id_produto: string;
  codigo: string;
  descricao: string;
  unidade: string;
  quantidade: string;
  valor_unitario: string;
}

interface OlistOrderInstallment {
  parcela: Installment;
}

interface Installment {
  dias: string;
  data: string;
  valor: string;
  obs: string;
  forma_pagamento: string;
  meio_pagamento: string;
}

export type OlistOrderResponse = OlistApiResponse<OlistOrder, "pedidos">;
