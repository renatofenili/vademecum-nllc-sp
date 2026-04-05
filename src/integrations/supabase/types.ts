export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      edital_jobs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          progress: number
          result: Json | null
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          progress?: number
          result?: Json | null
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          progress?: number
          result?: Json | null
          status?: string
        }
        Relationships: []
      }
      jurisprudencia: {
        Row: {
          boletim_referencia: string | null
          created_at: string
          id: string
          link_relatorio_voto: string | null
          materia: string | null
          numero_tc: string
          objeto: string | null
          resumo: string | null
          sessao_data: string | null
          temas: string[]
        }
        Insert: {
          boletim_referencia?: string | null
          created_at?: string
          id?: string
          link_relatorio_voto?: string | null
          materia?: string | null
          numero_tc: string
          objeto?: string | null
          resumo?: string | null
          sessao_data?: string | null
          temas?: string[]
        }
        Update: {
          boletim_referencia?: string | null
          created_at?: string
          id?: string
          link_relatorio_voto?: string | null
          materia?: string | null
          numero_tc?: string
          objeto?: string | null
          resumo?: string | null
          sessao_data?: string | null
          temas?: string[]
        }
        Relationships: []
      }
      normas: {
        Row: {
          analise_norma: string | null
          created_at: string
          data_publicacao: string
          ementa: string
          fim_vigencia: string | null
          id: string
          inicio_vigencia: string | null
          link_externo: string | null
          numero: string
          observacoes: string | null
          orgao_emissor: string | null
          pdf_hash: string | null
          pdf_mime_type: string | null
          pdf_nome_arquivo: string | null
          pdf_storage_path: string | null
          pdf_tamanho: number | null
          pdf_upload_em: string | null
          pdf_url: string | null
          remissoes_extraidas: Json | null
          remissoes_extraidas_em: string | null
          remissoes_status: string | null
          search_vector: unknown
          status: string | null
          tema: Json | null
          texto_extraido: string | null
          texto_extraido_em: string | null
          texto_extraido_origem: string | null
          texto_extraido_progresso_atual: number | null
          texto_extraido_progresso_em: string | null
          texto_extraido_progresso_total: number | null
          texto_extraido_status: string | null
          tipo: Database["public"]["Enums"]["norm_type"]
          updated_at: string
          video_storage_path: string | null
        }
        Insert: {
          analise_norma?: string | null
          created_at?: string
          data_publicacao: string
          ementa: string
          fim_vigencia?: string | null
          id?: string
          inicio_vigencia?: string | null
          link_externo?: string | null
          numero: string
          observacoes?: string | null
          orgao_emissor?: string | null
          pdf_hash?: string | null
          pdf_mime_type?: string | null
          pdf_nome_arquivo?: string | null
          pdf_storage_path?: string | null
          pdf_tamanho?: number | null
          pdf_upload_em?: string | null
          pdf_url?: string | null
          remissoes_extraidas?: Json | null
          remissoes_extraidas_em?: string | null
          remissoes_status?: string | null
          search_vector?: unknown
          status?: string | null
          tema?: Json | null
          texto_extraido?: string | null
          texto_extraido_em?: string | null
          texto_extraido_origem?: string | null
          texto_extraido_progresso_atual?: number | null
          texto_extraido_progresso_em?: string | null
          texto_extraido_progresso_total?: number | null
          texto_extraido_status?: string | null
          tipo: Database["public"]["Enums"]["norm_type"]
          updated_at?: string
          video_storage_path?: string | null
        }
        Update: {
          analise_norma?: string | null
          created_at?: string
          data_publicacao?: string
          ementa?: string
          fim_vigencia?: string | null
          id?: string
          inicio_vigencia?: string | null
          link_externo?: string | null
          numero?: string
          observacoes?: string | null
          orgao_emissor?: string | null
          pdf_hash?: string | null
          pdf_mime_type?: string | null
          pdf_nome_arquivo?: string | null
          pdf_storage_path?: string | null
          pdf_tamanho?: number | null
          pdf_upload_em?: string | null
          pdf_url?: string | null
          remissoes_extraidas?: Json | null
          remissoes_extraidas_em?: string | null
          remissoes_status?: string | null
          search_vector?: unknown
          status?: string | null
          tema?: Json | null
          texto_extraido?: string | null
          texto_extraido_em?: string | null
          texto_extraido_origem?: string | null
          texto_extraido_progresso_atual?: number | null
          texto_extraido_progresso_em?: string | null
          texto_extraido_progresso_total?: number | null
          texto_extraido_status?: string | null
          tipo?: Database["public"]["Enums"]["norm_type"]
          updated_at?: string
          video_storage_path?: string | null
        }
        Relationships: []
      }
      normas_fases: {
        Row: {
          criado_em: string
          fase: string
          id: number
          intensidade: string
          norma_id: string
        }
        Insert: {
          criado_em?: string
          fase: string
          id?: number
          intensidade: string
          norma_id: string
        }
        Update: {
          criado_em?: string
          fase?: string
          id?: number
          intensidade?: string
          norma_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "normas_fases_norma_fk"
            columns: ["norma_id"]
            isOneToOne: false
            referencedRelation: "normas"
            referencedColumns: ["id"]
          },
        ]
      }
      normas_temas: {
        Row: {
          criado_em: string
          id: number
          intensidade: string
          norma_id: string
          tema: string
        }
        Insert: {
          criado_em?: string
          id?: number
          intensidade: string
          norma_id: string
          tema: string
        }
        Update: {
          criado_em?: string
          id?: number
          intensidade?: string
          norma_id?: string
          tema?: string
        }
        Relationships: [
          {
            foreignKeyName: "normas_temas_norma_fk"
            columns: ["norma_id"]
            isOneToOne: false
            referencedRelation: "normas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      norm_type:
        | "decreto"
        | "resolucao"
        | "portaria"
        | "lei"
        | "instrucao_normativa"
        | "outro"
        | "lei_federal"
        | "lei_estadual"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      norm_type: [
        "decreto",
        "resolucao",
        "portaria",
        "lei",
        "instrucao_normativa",
        "outro",
        "lei_federal",
        "lei_estadual",
      ],
    },
  },
} as const
