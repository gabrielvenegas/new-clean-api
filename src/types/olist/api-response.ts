export interface OlistApiResponse<T, K extends string> {
  retorno:
    | {
        status_processamento: string;
        status: "Erro";
        codigo_erro: string;
        erros: object[];
      }
    | ({
        status_processamento: string;
        status: "success";
        pagina: number;
        numero_paginas: number;
      } & Record<K, T[]>);
}
