export interface ActNode {
  id: string;
  tipo: string;
  numero: string;
  ementa: string;
  orgao_emissor: string | null;
  data_publicacao: string;
  status: string | null;
}

export interface ActEdge {
  from_act: string;
  to_act: string;
  relation_type: "implements" | "regulates" | "refers_to" | "amends" | "revokes";
  evidences: {
    from_anchor: string;
    to_anchor: string;
    excerpt: string;
  }[];
}

export interface ActsGraphData {
  root: string;
  nodes: ActNode[];
  edges: ActEdge[];
}

export interface DispositivoNode {
  anchor: string;
  nivel: string;
  texto: string;
}

export interface DispositivoEdge {
  from_anchor: string;
  to_anchor: string;
  to_document: string | null;
  raw_reference: string;
  confidence: string;
}

export interface DispositivosGraphData {
  act_id: string;
  act_info: {
    tipo: string;
    numero: string;
    ementa: string;
  };
  nodes: DispositivoNode[];
  edges: DispositivoEdge[];
}

export type GraphLevel = "ato" | "dispositivo";
export type RootOption = "cf88" | "lei14133";
export type RelationType = ActEdge["relation_type"];
