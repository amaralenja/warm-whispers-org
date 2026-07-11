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
      agenda_leads: {
        Row: {
          concluido: boolean | null
          created_at: string | null
          data_agendada: string
          descricao: string | null
          id: string
          lead_nome: string
          lead_telefone: string | null
          vendedor_utm: string
        }
        Insert: {
          concluido?: boolean | null
          created_at?: string | null
          data_agendada: string
          descricao?: string | null
          id?: string
          lead_nome: string
          lead_telefone?: string | null
          vendedor_utm: string
        }
        Update: {
          concluido?: boolean | null
          created_at?: string | null
          data_agendada?: string
          descricao?: string | null
          id?: string
          lead_nome?: string
          lead_telefone?: string | null
          vendedor_utm?: string
        }
        Relationships: []
      }
      aparelhos: {
        Row: {
          created_at: string | null
          device_id: string
          id: number
          status: string | null
          wa_business: string | null
          wa_pessoal1: string | null
          wa_pessoal2: string | null
          workspace: string
        }
        Insert: {
          created_at?: string | null
          device_id: string
          id?: number
          status?: string | null
          wa_business?: string | null
          wa_pessoal1?: string | null
          wa_pessoal2?: string | null
          workspace?: string
        }
        Update: {
          created_at?: string | null
          device_id?: string
          id?: number
          status?: string | null
          wa_business?: string | null
          wa_pessoal1?: string | null
          wa_pessoal2?: string | null
          workspace?: string
        }
        Relationships: []
      }
      checklist_completions: {
        Row: {
          completed_at: string | null
          data: string
          id: string
          task_id: string
          vendedor_utm: string
        }
        Insert: {
          completed_at?: string | null
          data?: string
          id?: string
          task_id: string
          vendedor_utm: string
        }
        Update: {
          completed_at?: string | null
          data?: string
          id?: string
          task_id?: string
          vendedor_utm?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "checklist_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_tasks: {
        Row: {
          alvo_tipo: string | null
          alvo_valor: string | null
          ativo: boolean | null
          created_at: string | null
          data_unica: string | null
          descricao: string | null
          id: string
          link_referencia: string | null
          prazo_hora: string | null
          prioridade: string | null
          tipo_recorrencia: string | null
          titulo: string
        }
        Insert: {
          alvo_tipo?: string | null
          alvo_valor?: string | null
          ativo?: boolean | null
          created_at?: string | null
          data_unica?: string | null
          descricao?: string | null
          id?: string
          link_referencia?: string | null
          prazo_hora?: string | null
          prioridade?: string | null
          tipo_recorrencia?: string | null
          titulo: string
        }
        Update: {
          alvo_tipo?: string | null
          alvo_valor?: string | null
          ativo?: boolean | null
          created_at?: string | null
          data_unica?: string | null
          descricao?: string | null
          id?: string
          link_referencia?: string | null
          prazo_hora?: string | null
          prioridade?: string | null
          tipo_recorrencia?: string | null
          titulo?: string
        }
        Relationships: []
      }
      chips: {
        Row: {
          aparelho: string | null
          codigo: string
          created_at: string | null
          data_ativacao: string | null
          data_saida_esteira: string | null
          email: string | null
          id: number
          notas: string | null
          numero: string | null
          operadora: string | null
          proxima_recarga: string | null
          score: number | null
          senha: string | null
          status: string | null
          tipo_whatsapp: string | null
          vendedor: string | null
        }
        Insert: {
          aparelho?: string | null
          codigo: string
          created_at?: string | null
          data_ativacao?: string | null
          data_saida_esteira?: string | null
          email?: string | null
          id?: number
          notas?: string | null
          numero?: string | null
          operadora?: string | null
          proxima_recarga?: string | null
          score?: number | null
          senha?: string | null
          status?: string | null
          tipo_whatsapp?: string | null
          vendedor?: string | null
        }
        Update: {
          aparelho?: string | null
          codigo?: string
          created_at?: string | null
          data_ativacao?: string | null
          data_saida_esteira?: string | null
          email?: string | null
          id?: number
          notas?: string | null
          numero?: string | null
          operadora?: string | null
          proxima_recarga?: string | null
          score?: number | null
          senha?: string | null
          status?: string | null
          tipo_whatsapp?: string | null
          vendedor?: string | null
        }
        Relationships: []
      }
      crm_bulk_dispatch_items: {
        Row: {
          contact_wa_id: string
          conversation_id: string | null
          created_at: string
          dispatch_id: string
          error: string | null
          id: string
          lead_id: string
          processed_at: string | null
          run_id: string | null
          scheduled_at: string
          status: string
        }
        Insert: {
          contact_wa_id: string
          conversation_id?: string | null
          created_at?: string
          dispatch_id: string
          error?: string | null
          id?: string
          lead_id: string
          processed_at?: string | null
          run_id?: string | null
          scheduled_at: string
          status?: string
        }
        Update: {
          contact_wa_id?: string
          conversation_id?: string | null
          created_at?: string
          dispatch_id?: string
          error?: string | null
          id?: string
          lead_id?: string
          processed_at?: string | null
          run_id?: string | null
          scheduled_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_bulk_dispatch_items_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "crm_bulk_dispatches"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_bulk_dispatches: {
        Row: {
          channel_id: string
          created_at: string
          created_by: string | null
          delay_seconds: number
          eligible_leads: number
          failed_count: number
          finished_at: string | null
          flow_id: string
          id: string
          operacao: string
          sent_count: number
          skipped_count: number
          stage_id: string
          started_at: string
          status: string
          total_leads: number
          updated_at: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          created_by?: string | null
          delay_seconds?: number
          eligible_leads?: number
          failed_count?: number
          finished_at?: string | null
          flow_id: string
          id?: string
          operacao: string
          sent_count?: number
          skipped_count?: number
          stage_id: string
          started_at?: string
          status?: string
          total_leads?: number
          updated_at?: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          created_by?: string | null
          delay_seconds?: number
          eligible_leads?: number
          failed_count?: number
          finished_at?: string | null
          flow_id?: string
          id?: string
          operacao?: string
          sent_count?: number
          skipped_count?: number
          stage_id?: string
          started_at?: string
          status?: string
          total_leads?: number
          updated_at?: string
        }
        Relationships: []
      }
      crm_fontes: {
        Row: {
          created_at: string | null
          id: number
          nome: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          nome: string
        }
        Update: {
          created_at?: string | null
          id?: number
          nome?: string
        }
        Relationships: []
      }
      crm_leads: {
        Row: {
          created_at: string
          dados: Json | null
          email: string | null
          expert: string | null
          fonte: string | null
          id: string
          nome: string
          notas: string | null
          ordem: number | null
          responsavel_nome: string | null
          responsavel_utm: string | null
          status: string
          tags: string[] | null
          telefone: string | null
          ultima_interacao: string | null
          updated_at: string
          valor_estimado: number | null
        }
        Insert: {
          created_at?: string
          dados?: Json | null
          email?: string | null
          expert?: string | null
          fonte?: string | null
          id?: string
          nome: string
          notas?: string | null
          ordem?: number | null
          responsavel_nome?: string | null
          responsavel_utm?: string | null
          status?: string
          tags?: string[] | null
          telefone?: string | null
          ultima_interacao?: string | null
          updated_at?: string
          valor_estimado?: number | null
        }
        Update: {
          created_at?: string
          dados?: Json | null
          email?: string | null
          expert?: string | null
          fonte?: string | null
          id?: string
          nome?: string
          notas?: string | null
          ordem?: number | null
          responsavel_nome?: string | null
          responsavel_utm?: string | null
          status?: string
          tags?: string[] | null
          telefone?: string | null
          ultima_interacao?: string | null
          updated_at?: string
          valor_estimado?: number | null
        }
        Relationships: []
      }
      crm_materiais: {
        Row: {
          created_at: string | null
          descricao: string | null
          expert: string | null
          id: number
          produto: string
          ticket: string | null
          tipo: string | null
          url: string
          vendedor_utm: string | null
        }
        Insert: {
          created_at?: string | null
          descricao?: string | null
          expert?: string | null
          id?: number
          produto: string
          ticket?: string | null
          tipo?: string | null
          url: string
          vendedor_utm?: string | null
        }
        Update: {
          created_at?: string | null
          descricao?: string | null
          expert?: string | null
          id?: number
          produto?: string
          ticket?: string | null
          tipo?: string | null
          url?: string
          vendedor_utm?: string | null
        }
        Relationships: []
      }
      crm_stages: {
        Row: {
          cor: string
          created_at: string
          id: string
          nome: string
          operacao: string
          ordem: number
        }
        Insert: {
          cor?: string
          created_at?: string
          id?: string
          nome: string
          operacao: string
          ordem?: number
        }
        Update: {
          cor?: string
          created_at?: string
          id?: string
          nome?: string
          operacao?: string
          ordem?: number
        }
        Relationships: []
      }
      crm_tags: {
        Row: {
          cor: string
          created_at: string
          id: string
          nome: string
          operacao: string
          stage_id: string | null
          updated_at: string
        }
        Insert: {
          cor?: string
          created_at?: string
          id?: string
          nome: string
          operacao?: string
          stage_id?: string | null
          updated_at?: string
        }
        Update: {
          cor?: string
          created_at?: string
          id?: string
          nome?: string
          operacao?: string
          stage_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      documentacao: {
        Row: {
          conteudo: string | null
          created_at: string | null
          emoji: string | null
          id: string
          ordem: number | null
          titulo: string
          updated_at: string | null
        }
        Insert: {
          conteudo?: string | null
          created_at?: string | null
          emoji?: string | null
          id: string
          ordem?: number | null
          titulo: string
          updated_at?: string | null
        }
        Update: {
          conteudo?: string | null
          created_at?: string | null
          emoji?: string | null
          id?: string
          ordem?: number | null
          titulo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      experts: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          crm_api_key: string | null
          drive_url: string | null
          foto_url: string | null
          id: number
          meta_mensal: number
          meta_nivel1: number
          meta_nivel2: number
          meta_nivel3: number
          nome: string
          quiz_api_key: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          crm_api_key?: string | null
          drive_url?: string | null
          foto_url?: string | null
          id?: never
          meta_mensal?: number
          meta_nivel1?: number
          meta_nivel2?: number
          meta_nivel3?: number
          nome: string
          quiz_api_key?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          crm_api_key?: string | null
          drive_url?: string | null
          foto_url?: string | null
          id?: never
          meta_mensal?: number
          meta_nivel1?: number
          meta_nivel2?: number
          meta_nivel3?: number
          nome?: string
          quiz_api_key?: string | null
        }
        Relationships: []
      }
      financeiro: {
        Row: {
          categoria: string
          created_at: string | null
          data_pagamento: string | null
          data_ref: string
          data_vencimento: string | null
          descricao: string
          id: number
          obs: string | null
          recorrente: boolean | null
          responsavel: string | null
          status: string | null
          tipo: string
          valor: number
        }
        Insert: {
          categoria?: string
          created_at?: string | null
          data_pagamento?: string | null
          data_ref?: string
          data_vencimento?: string | null
          descricao: string
          id?: number
          obs?: string | null
          recorrente?: boolean | null
          responsavel?: string | null
          status?: string | null
          tipo?: string
          valor?: number
        }
        Update: {
          categoria?: string
          created_at?: string | null
          data_pagamento?: string | null
          data_ref?: string
          data_vencimento?: string | null
          descricao?: string
          id?: number
          obs?: string | null
          recorrente?: boolean | null
          responsavel?: string | null
          status?: string | null
          tipo?: string
          valor?: number
        }
        Relationships: []
      }
      ht_alunos: {
        Row: {
          created_at: string | null
          data_inicio: string | null
          email: string | null
          id: string
          lead_id: string | null
          nome: string
          obs: string | null
          sessoes_contratadas: number | null
          status: string | null
          telefone: string | null
        }
        Insert: {
          created_at?: string | null
          data_inicio?: string | null
          email?: string | null
          id?: string
          lead_id?: string | null
          nome: string
          obs?: string | null
          sessoes_contratadas?: number | null
          status?: string | null
          telefone?: string | null
        }
        Update: {
          created_at?: string | null
          data_inicio?: string | null
          email?: string | null
          id?: string
          lead_id?: string | null
          nome?: string
          obs?: string | null
          sessoes_contratadas?: number | null
          status?: string | null
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ht_alunos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "ht_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      ht_api_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          token_hash: string
          token_prefix: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          token_hash: string
          token_prefix: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          token_hash?: string
          token_prefix?: string
        }
        Relationships: []
      }
      ht_assets: {
        Row: {
          categoria: string | null
          created_at: string | null
          descricao: string | null
          id: string
          link: string | null
          nome: string
          tags: string[] | null
        }
        Insert: {
          categoria?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          link?: string | null
          nome: string
          tags?: string[] | null
        }
        Update: {
          categoria?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          link?: string | null
          nome?: string
          tags?: string[] | null
        }
        Relationships: []
      }
      ht_contas_receber: {
        Row: {
          closer: string | null
          created_at: string
          data_fechamento: string | null
          falta_receber: number | null
          faturamento_total: number
          id: string
          nome: string
          observacoes: string | null
          previsao_pagar_restante: string | null
          recebido: number
          status: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          closer?: string | null
          created_at?: string
          data_fechamento?: string | null
          falta_receber?: number | null
          faturamento_total?: number
          id?: string
          nome: string
          observacoes?: string | null
          previsao_pagar_restante?: string | null
          recebido?: number
          status?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          closer?: string | null
          created_at?: string
          data_fechamento?: string | null
          falta_receber?: number | null
          faturamento_total?: number
          id?: string
          nome?: string
          observacoes?: string | null
          previsao_pagar_restante?: string | null
          recebido?: number
          status?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      ht_lead_notes: {
        Row: {
          author: string | null
          body: string
          created_at: string
          id: string
          lead_id: string
          role: string
        }
        Insert: {
          author?: string | null
          body: string
          created_at?: string
          id?: string
          lead_id: string
          role?: string
        }
        Update: {
          author?: string | null
          body?: string
          created_at?: string
          id?: string
          lead_id?: string
          role?: string
        }
        Relationships: []
      }
      ht_leads: {
        Row: {
          closer: string | null
          created_at: string | null
          data_agendamento: string | null
          email: string | null
          id: string
          nome: string
          notas: string | null
          status: string | null
          telefone: string | null
          valor: number | null
        }
        Insert: {
          closer?: string | null
          created_at?: string | null
          data_agendamento?: string | null
          email?: string | null
          id?: string
          nome: string
          notas?: string | null
          status?: string | null
          telefone?: string | null
          valor?: number | null
        }
        Update: {
          closer?: string | null
          created_at?: string | null
          data_agendamento?: string | null
          email?: string | null
          id?: string
          nome?: string
          notas?: string | null
          status?: string | null
          telefone?: string | null
          valor?: number | null
        }
        Relationships: []
      }
      ht_quiz_submissions: {
        Row: {
          email: string | null
          fbc: string | null
          fbclid: string | null
          fbp: string | null
          gclid: string | null
          id: string
          instagram: string | null
          nome: string | null
          raw: Json
          received_at: string
          respostas: Json | null
          session_id: string | null
          status: string
          token_id: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          whatsapp: string | null
        }
        Insert: {
          email?: string | null
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          gclid?: string | null
          id?: string
          instagram?: string | null
          nome?: string | null
          raw?: Json
          received_at?: string
          respostas?: Json | null
          session_id?: string | null
          status?: string
          token_id?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          whatsapp?: string | null
        }
        Update: {
          email?: string | null
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          gclid?: string | null
          id?: string
          instagram?: string | null
          nome?: string | null
          raw?: Json
          received_at?: string
          respostas?: Json | null
          session_id?: string | null
          status?: string
          token_id?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ht_quiz_submissions_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "ht_api_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      ht_reunioes: {
        Row: {
          aluno_id: string | null
          created_at: string | null
          data: string | null
          duracao: number | null
          id: string
          pauta: string | null
        }
        Insert: {
          aluno_id?: string | null
          created_at?: string | null
          data?: string | null
          duracao?: number | null
          id?: string
          pauta?: string | null
        }
        Update: {
          aluno_id?: string | null
          created_at?: string | null
          data?: string | null
          duracao?: number | null
          id?: string
          pauta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ht_reunioes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "ht_alunos"
            referencedColumns: ["id"]
          },
        ]
      }
      ht_team: {
        Row: {
          ativo: boolean | null
          codigo: string | null
          created_at: string
          email: string | null
          foto_url: string | null
          id: number
          nome: string | null
          permissoes: Json | null
          telefone: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean | null
          codigo?: string | null
          created_at?: string
          email?: string | null
          foto_url?: string | null
          id?: never
          nome?: string | null
          permissoes?: Json | null
          telefone?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean | null
          codigo?: string | null
          created_at?: string
          email?: string | null
          foto_url?: string | null
          id?: never
          nome?: string | null
          permissoes?: Json | null
          telefone?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      ht_vendas: {
        Row: {
          cliente: string | null
          closer: string | null
          comissao_pct: number | null
          comissao_valor: number | null
          created_at: string | null
          data: string | null
          id: string
          lead_id: string | null
          produto: string | null
          status: string | null
          taxa_plataforma: number | null
          valor_liquido: number | null
          valor_total: number | null
        }
        Insert: {
          cliente?: string | null
          closer?: string | null
          comissao_pct?: number | null
          comissao_valor?: number | null
          created_at?: string | null
          data?: string | null
          id?: string
          lead_id?: string | null
          produto?: string | null
          status?: string | null
          taxa_plataforma?: number | null
          valor_liquido?: number | null
          valor_total?: number | null
        }
        Update: {
          cliente?: string | null
          closer?: string | null
          comissao_pct?: number | null
          comissao_valor?: number | null
          created_at?: string | null
          data?: string | null
          id?: string
          lead_id?: string | null
          produto?: string | null
          status?: string | null
          taxa_plataforma?: number | null
          valor_liquido?: number | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ht_vendas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "ht_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_leads: {
        Row: {
          biography: string | null
          created_at: string
          fetched_at: string
          followers: number | null
          following: number | null
          full_name: string | null
          id: string
          is_verified: boolean | null
          posts_count: number | null
          profile_pic_url: string | null
          profile_url: string | null
          raw: Json | null
          updated_at: string
          username: string
          verification_status: string
        }
        Insert: {
          biography?: string | null
          created_at?: string
          fetched_at?: string
          followers?: number | null
          following?: number | null
          full_name?: string | null
          id?: string
          is_verified?: boolean | null
          posts_count?: number | null
          profile_pic_url?: string | null
          profile_url?: string | null
          raw?: Json | null
          updated_at?: string
          username: string
          verification_status?: string
        }
        Update: {
          biography?: string | null
          created_at?: string
          fetched_at?: string
          followers?: number | null
          following?: number | null
          full_name?: string | null
          id?: string
          is_verified?: boolean | null
          posts_count?: number | null
          profile_pic_url?: string | null
          profile_url?: string | null
          raw?: Json | null
          updated_at?: string
          username?: string
          verification_status?: string
        }
        Relationships: []
      }
      meta_ads_config: {
        Row: {
          access_token: string
          created_at: string
          id: string
          pixel_id: string
          test_event_code: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string
          created_at?: string
          id?: string
          pixel_id?: string
          test_event_code?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          id?: string
          pixel_id?: string
          test_event_code?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      meta_ads_event_logs: {
        Row: {
          client_ip_hash: string | null
          created_at: string
          currency: string
          email_hash: string | null
          error_message: string | null
          event_id: string
          event_name: string
          event_source_url: string | null
          events_received: number | null
          external_id_hash: string | null
          fbtrace_id: string | null
          first_name_hash: string | null
          id: string
          last_name_hash: string | null
          match_quality_score: number
          phone_hash: string | null
          status: string
          updated_at: string
          user_agent: string | null
          user_id: string
          value: number | null
        }
        Insert: {
          client_ip_hash?: string | null
          created_at?: string
          currency?: string
          email_hash?: string | null
          error_message?: string | null
          event_id: string
          event_name: string
          event_source_url?: string | null
          events_received?: number | null
          external_id_hash?: string | null
          fbtrace_id?: string | null
          first_name_hash?: string | null
          id?: string
          last_name_hash?: string | null
          match_quality_score?: number
          phone_hash?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
          value?: number | null
        }
        Update: {
          client_ip_hash?: string | null
          created_at?: string
          currency?: string
          email_hash?: string | null
          error_message?: string | null
          event_id?: string
          event_name?: string
          event_source_url?: string | null
          events_received?: number | null
          external_id_hash?: string | null
          fbtrace_id?: string | null
          first_name_hash?: string | null
          id?: string
          last_name_hash?: string | null
          match_quality_score?: number
          phone_hash?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
          value?: number | null
        }
        Relationships: []
      }
      produtos_map: {
        Row: {
          created_at: string
          id: string
          nome_expert: string
          nome_produto: string
          tipo_produto: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          nome_expert: string
          nome_produto: string
          tipo_produto?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          nome_expert?: string
          nome_produto?: string
          tipo_produto?: string | null
        }
        Relationships: []
      }
      pv24h_config: {
        Row: {
          access_token: string
          ad_account_id: string | null
          ad_account_name: string | null
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          ad_account_id?: string | null
          ad_account_name?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          ad_account_id?: string | null
          ad_account_name?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reembolsos: {
        Row: {
          "Data da Venda": string | null
          "Data do Reembolso": string | null
          "Email do Cliente": string | null
          id: number
          "ID da Venda": string | null
          "Nome do Cliente": string | null
          "Número do Documento do Cliente": string | null
          Produto: string | null
          "Status da Venda": string | null
          "Telefone do Cliente": string | null
          "Tipo da Venda": string | null
          utm_source: string | null
          "Valor Base do Produto": string | null
        }
        Insert: {
          "Data da Venda"?: string | null
          "Data do Reembolso"?: string | null
          "Email do Cliente"?: string | null
          id?: number
          "ID da Venda"?: string | null
          "Nome do Cliente"?: string | null
          "Número do Documento do Cliente"?: string | null
          Produto?: string | null
          "Status da Venda"?: string | null
          "Telefone do Cliente"?: string | null
          "Tipo da Venda"?: string | null
          utm_source?: string | null
          "Valor Base do Produto"?: string | null
        }
        Update: {
          "Data da Venda"?: string | null
          "Data do Reembolso"?: string | null
          "Email do Cliente"?: string | null
          id?: number
          "ID da Venda"?: string | null
          "Nome do Cliente"?: string | null
          "Número do Documento do Cliente"?: string | null
          Produto?: string | null
          "Status da Venda"?: string | null
          "Telefone do Cliente"?: string | null
          "Tipo da Venda"?: string | null
          utm_source?: string | null
          "Valor Base do Produto"?: string | null
        }
        Relationships: []
      }
      reembolsos_ativos: {
        Row: {
          created_at: string
          email: string | null
          feedback: string | null
          id: string
          id_venda: string | null
          motivo: string | null
          nome: string | null
          status: string | null
          UTM: string | null
          whatsapp: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          feedback?: string | null
          id?: string
          id_venda?: string | null
          motivo?: string | null
          nome?: string | null
          status?: string | null
          UTM?: string | null
          whatsapp?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          feedback?: string | null
          id?: string
          id_venda?: string | null
          motivo?: string | null
          nome?: string | null
          status?: string | null
          UTM?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      sops: {
        Row: {
          categoria: string
          conteudo: string
          created_at: string
          emoji: string | null
          id: string
          ordem: number
          titulo: string
          updated_at: string
        }
        Insert: {
          categoria?: string
          conteudo?: string
          created_at?: string
          emoji?: string | null
          id?: string
          ordem?: number
          titulo?: string
          updated_at?: string
        }
        Update: {
          categoria?: string
          conteudo?: string
          created_at?: string
          emoji?: string | null
          id?: string
          ordem?: number
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      sops_history: {
        Row: {
          action: string
          changed_fields: string[] | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          sop_id: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changed_fields?: string[] | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          sop_id: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changed_fields?: string[] | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          sop_id?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      task_boards: {
        Row: {
          cor: string | null
          created_at: string
          descricao: string | null
          id: string
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          cor?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          cor?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: []
      }
      task_columns: {
        Row: {
          board_id: string
          cor: string | null
          created_at: string
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          board_id: string
          cor?: string | null
          created_at?: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          board_id?: string
          cor?: string | null
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_columns_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "task_boards"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          anexos: Json | null
          assignee_ids: string[] | null
          board_id: string
          checklist: Json | null
          column_id: string
          concluida: boolean | null
          created_at: string
          descricao: string | null
          id: string
          labels: string[] | null
          ordem: number
          prazo: string | null
          prioridade: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          anexos?: Json | null
          assignee_ids?: string[] | null
          board_id: string
          checklist?: Json | null
          column_id: string
          concluida?: boolean | null
          created_at?: string
          descricao?: string | null
          id?: string
          labels?: string[] | null
          ordem?: number
          prazo?: string | null
          prioridade?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          anexos?: Json | null
          assignee_ids?: string[] | null
          board_id?: string
          checklist?: Json | null
          column_id?: string
          concluida?: boolean | null
          created_at?: string
          descricao?: string | null
          id?: string
          labels?: string[] | null
          ordem?: number
          prazo?: string | null
          prioridade?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "task_boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "task_columns"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          ativo: boolean | null
          cor: string | null
          created_at: string
          email: string | null
          foto_url: string | null
          funcao: string | null
          id: string
          nome: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean | null
          cor?: string | null
          created_at?: string
          email?: string | null
          foto_url?: string | null
          funcao?: string | null
          id?: string
          nome: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean | null
          cor?: string | null
          created_at?: string
          email?: string | null
          foto_url?: string | null
          funcao?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      uaz_config: {
        Row: {
          id: number
          instance_token: string | null
          server_url: string | null
          updated_at: string
        }
        Insert: {
          id?: number
          instance_token?: string | null
          server_url?: string | null
          updated_at?: string
        }
        Update: {
          id?: number
          instance_token?: string | null
          server_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      uaz_webhook_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json | null
        }
        Insert: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json | null
        }
        Relationships: []
      }
      user_prefs: {
        Row: {
          owner_key: string
          pref_key: string
          updated_at: string
          value: Json
        }
        Insert: {
          owner_key: string
          pref_key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          owner_key?: string
          pref_key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      vendas: {
        Row: {
          Campanha: string | null
          Data: string | null
          Email: string
          Evento: string | null
          id: number
          "ID de Referência": string
          Nome: string | null
          nome_expert: string | null
          Plaforma: string | null
          Produto: string
          Telefone: string | null
          Ticket: string | null
          tipo_produto: string | null
          UTM: string | null
        }
        Insert: {
          Campanha?: string | null
          Data?: string | null
          Email: string
          Evento?: string | null
          id?: number
          "ID de Referência": string
          Nome?: string | null
          nome_expert?: string | null
          Plaforma?: string | null
          Produto: string
          Telefone?: string | null
          Ticket?: string | null
          tipo_produto?: string | null
          UTM?: string | null
        }
        Update: {
          Campanha?: string | null
          Data?: string | null
          Email?: string
          Evento?: string | null
          id?: number
          "ID de Referência"?: string
          Nome?: string | null
          nome_expert?: string | null
          Plaforma?: string | null
          Produto?: string
          Telefone?: string | null
          Ticket?: string | null
          tipo_produto?: string | null
          UTM?: string | null
        }
        Relationships: []
      }
      vendedores: {
        Row: {
          ativo: boolean | null
          codigo: string | null
          comissao_pct: number
          created_at: string | null
          expert: string
          foto_url: string | null
          genero: string | null
          id: number
          lead_weight: number
          meta: number | null
          nome: string
          permissoes: Json
          pix_chave: string | null
          telefone: string | null
          utm: string
          wa_channel_ids: string[]
          workspace_ids: string[] | null
        }
        Insert: {
          ativo?: boolean | null
          codigo?: string | null
          comissao_pct?: number
          created_at?: string | null
          expert: string
          foto_url?: string | null
          genero?: string | null
          id?: never
          lead_weight?: number
          meta?: number | null
          nome: string
          permissoes?: Json
          pix_chave?: string | null
          telefone?: string | null
          utm: string
          wa_channel_ids?: string[]
          workspace_ids?: string[] | null
        }
        Update: {
          ativo?: boolean | null
          codigo?: string | null
          comissao_pct?: number
          created_at?: string | null
          expert?: string
          foto_url?: string | null
          genero?: string | null
          id?: never
          lead_weight?: number
          meta?: number | null
          nome?: string
          permissoes?: Json
          pix_chave?: string | null
          telefone?: string | null
          utm?: string
          wa_channel_ids?: string[]
          workspace_ids?: string[] | null
        }
        Relationships: []
      }
      vendor_backups: {
        Row: {
          created_at: string | null
          id: number
          json_content: string
          updated_at: string | null
          vendedor_id: number | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          json_content: string
          updated_at?: string | null
          vendedor_id?: number | null
        }
        Update: {
          created_at?: string | null
          id?: number
          json_content?: string
          updated_at?: string | null
          vendedor_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_backups_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: true
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_checkouts: {
        Row: {
          created_at: string
          id: string
          image_path: string | null
          link: string
          mensagem: string
          nome: string
          ordem: number
          updated_at: string
          vendedor_id: number
        }
        Insert: {
          created_at?: string
          id?: string
          image_path?: string | null
          link?: string
          mensagem?: string
          nome: string
          ordem?: number
          updated_at?: string
          vendedor_id: number
        }
        Update: {
          created_at?: string
          id?: string
          image_path?: string | null
          link?: string
          mensagem?: string
          nome?: string
          ordem?: number
          updated_at?: string
          vendedor_id?: number
        }
        Relationships: []
      }
      wa_ai_sessions: {
        Row: {
          calendar_event_id: string | null
          channel_id: string
          contact_name: string | null
          contact_wa: string
          context: Json
          created_at: string
          id: string
          last_button: string | null
          messages: Json
          reminder_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          calendar_event_id?: string | null
          channel_id: string
          contact_name?: string | null
          contact_wa: string
          context?: Json
          created_at?: string
          id?: string
          last_button?: string | null
          messages?: Json
          reminder_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          calendar_event_id?: string | null
          channel_id?: string
          contact_name?: string | null
          contact_wa?: string
          context?: Json
          created_at?: string
          id?: string
          last_button?: string | null
          messages?: Json
          reminder_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      wa_call_reminders: {
        Row: {
          channel_id: string | null
          contact_wa: string
          convidados: string | null
          created_at: string
          error_message: string | null
          event_id: string
          hora: string | null
          id: string
          kind: string
          lead_email: string | null
          lead_externalid: string | null
          lead_fbc: string | null
          lead_fbp: string | null
          lead_nome: string | null
          replied_at: string | null
          sent_at: string | null
          status: string
          updated_at: string
          wa_message_id: string | null
        }
        Insert: {
          channel_id?: string | null
          contact_wa: string
          convidados?: string | null
          created_at?: string
          error_message?: string | null
          event_id: string
          hora?: string | null
          id?: string
          kind?: string
          lead_email?: string | null
          lead_externalid?: string | null
          lead_fbc?: string | null
          lead_fbp?: string | null
          lead_nome?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
          wa_message_id?: string | null
        }
        Update: {
          channel_id?: string | null
          contact_wa?: string
          convidados?: string | null
          created_at?: string
          error_message?: string | null
          event_id?: string
          hora?: string | null
          id?: string
          kind?: string
          lead_email?: string | null
          lead_externalid?: string | null
          lead_fbc?: string | null
          lead_fbp?: string | null
          lead_nome?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
          wa_message_id?: string | null
        }
        Relationships: []
      }
      wa_channels: {
        Row: {
          app_source: string
          connect_url: string | null
          created_at: string | null
          display_phone_number: string | null
          id: string
          kind: string
          metadata: Json
          name: string
          operacao_id: string | null
          phone_number_id: string | null
          quality_rating: string | null
          status: string | null
          synced_at: string
          token: string | null
          type: string
          updated_at: string
          verified_name: string | null
        }
        Insert: {
          app_source?: string
          connect_url?: string | null
          created_at?: string | null
          display_phone_number?: string | null
          id: string
          kind?: string
          metadata?: Json
          name?: string
          operacao_id?: string | null
          phone_number_id?: string | null
          quality_rating?: string | null
          status?: string | null
          synced_at?: string
          token?: string | null
          type?: string
          updated_at?: string
          verified_name?: string | null
        }
        Update: {
          app_source?: string
          connect_url?: string | null
          created_at?: string | null
          display_phone_number?: string | null
          id?: string
          kind?: string
          metadata?: Json
          name?: string
          operacao_id?: string | null
          phone_number_id?: string | null
          quality_rating?: string | null
          status?: string | null
          synced_at?: string
          token?: string | null
          type?: string
          updated_at?: string
          verified_name?: string | null
        }
        Relationships: []
      }
      wa_conversations: {
        Row: {
          archived_at: string | null
          assigned_vendor_id: number | null
          channel_id: string
          contact_avatar_url: string | null
          contact_name: string | null
          contact_wa_id: string
          created_at: string
          id: string
          last_message_at: string
          last_message_direction: string | null
          last_message_preview: string | null
          last_message_status: string | null
          notes: string | null
          operacao_id: string | null
          phone_number_id: string | null
          tags: string[]
          unread_count: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          assigned_vendor_id?: number | null
          channel_id: string
          contact_avatar_url?: string | null
          contact_name?: string | null
          contact_wa_id: string
          created_at?: string
          id?: string
          last_message_at?: string
          last_message_direction?: string | null
          last_message_preview?: string | null
          last_message_status?: string | null
          notes?: string | null
          operacao_id?: string | null
          phone_number_id?: string | null
          tags?: string[]
          unread_count?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          assigned_vendor_id?: number | null
          channel_id?: string
          contact_avatar_url?: string | null
          contact_name?: string | null
          contact_wa_id?: string
          created_at?: string
          id?: string
          last_message_at?: string
          last_message_direction?: string | null
          last_message_preview?: string | null
          last_message_status?: string | null
          notes?: string | null
          operacao_id?: string | null
          phone_number_id?: string | null
          tags?: string[]
          unread_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      wa_flow_executions: {
        Row: {
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          input: Json | null
          node_id: string
          node_type: string
          output: Json | null
          run_id: string
          status: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          input?: Json | null
          node_id: string
          node_type: string
          output?: Json | null
          run_id: string
          status: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          input?: Json | null
          node_id?: string
          node_type?: string
          output?: Json | null
          run_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_flow_executions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "wa_flow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_flow_runs: {
        Row: {
          channel_id: string
          contact_wa_id: string
          context: Json
          conversation_id: string | null
          created_at: string
          current_node_id: string | null
          error: string | null
          expires_at: string | null
          flow_id: string
          id: string
          status: string
          updated_at: string
          waiting_for: string | null
        }
        Insert: {
          channel_id: string
          contact_wa_id: string
          context?: Json
          conversation_id?: string | null
          created_at?: string
          current_node_id?: string | null
          error?: string | null
          expires_at?: string | null
          flow_id: string
          id?: string
          status?: string
          updated_at?: string
          waiting_for?: string | null
        }
        Update: {
          channel_id?: string
          contact_wa_id?: string
          context?: Json
          conversation_id?: string | null
          created_at?: string
          current_node_id?: string | null
          error?: string | null
          expires_at?: string | null
          flow_id?: string
          id?: string
          status?: string
          updated_at?: string
          waiting_for?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_flow_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_flow_runs_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "wa_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_flow_triggers: {
        Row: {
          ativo: boolean
          channel_id: string | null
          created_at: string
          days_of_week: number[] | null
          flow_id: string
          id: string
          match_mode: string
          time_end: string | null
          time_start: string | null
          timezone: string
          tipo: string
          valor: string | null
        }
        Insert: {
          ativo?: boolean
          channel_id?: string | null
          created_at?: string
          days_of_week?: number[] | null
          flow_id: string
          id?: string
          match_mode?: string
          time_end?: string | null
          time_start?: string | null
          timezone?: string
          tipo: string
          valor?: string | null
        }
        Update: {
          ativo?: boolean
          channel_id?: string | null
          created_at?: string
          days_of_week?: number[] | null
          flow_id?: string
          id?: string
          match_mode?: string
          time_end?: string | null
          time_start?: string | null
          timezone?: string
          tipo?: string
          valor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_flow_triggers_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "wa_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_flows: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          descricao: string | null
          edges: Json
          entry_node_id: string | null
          folder: string | null
          id: string
          nodes: Json
          nome: string
          operacao_id: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          edges?: Json
          entry_node_id?: string | null
          folder?: string | null
          id?: string
          nodes?: Json
          nome: string
          operacao_id?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          edges?: Json
          entry_node_id?: string | null
          folder?: string | null
          id?: string
          nodes?: Json
          nome?: string
          operacao_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      wa_messages: {
        Row: {
          caption: string | null
          channel_id: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          direction: string
          error_message: string | null
          from_wa_id: string | null
          id: string
          media_filename: string | null
          media_id: string | null
          media_mime: string | null
          media_url: string | null
          msg_type: string
          raw: Json | null
          reply_to: string | null
          sent_by: string | null
          status: string | null
          text_body: string | null
          to_wa_id: string | null
          wa_message_id: string | null
        }
        Insert: {
          caption?: string | null
          channel_id: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          direction: string
          error_message?: string | null
          from_wa_id?: string | null
          id?: string
          media_filename?: string | null
          media_id?: string | null
          media_mime?: string | null
          media_url?: string | null
          msg_type?: string
          raw?: Json | null
          reply_to?: string | null
          sent_by?: string | null
          status?: string | null
          text_body?: string | null
          to_wa_id?: string | null
          wa_message_id?: string | null
        }
        Update: {
          caption?: string | null
          channel_id?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          direction?: string
          error_message?: string | null
          from_wa_id?: string | null
          id?: string
          media_filename?: string | null
          media_id?: string | null
          media_mime?: string | null
          media_url?: string | null
          msg_type?: string
          raw?: Json | null
          reply_to?: string | null
          sent_by?: string | null
          status?: string | null
          text_body?: string | null
          to_wa_id?: string | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_task_notifications: {
        Row: {
          channel_id: string | null
          contact_wa: string
          created_at: string
          error_message: string | null
          id: string
          kind: string
          member_id: string
          sent_at: string | null
          status: string
          task_id: string
          wa_message_id: string | null
        }
        Insert: {
          channel_id?: string | null
          contact_wa: string
          created_at?: string
          error_message?: string | null
          id?: string
          kind: string
          member_id: string
          sent_at?: string | null
          status?: string
          task_id: string
          wa_message_id?: string | null
        }
        Update: {
          channel_id?: string | null
          contact_wa?: string
          created_at?: string
          error_message?: string | null
          id?: string
          kind?: string
          member_id?: string
          sent_at?: string | null
          status?: string
          task_id?: string
          wa_message_id?: string | null
        }
        Relationships: []
      }
      wa_template_recipients: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string | null
          telefone: string
          template_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string | null
          telefone: string
          template_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string | null
          telefone?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_template_recipients_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "wa_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_templates: {
        Row: {
          ativo: boolean
          buttons: Json
          categoria: string
          conteudo: string
          created_at: string
          descricao: string | null
          grupo: string
          id: string
          meta_category: string | null
          meta_channel_id: string | null
          meta_rejected_reason: string | null
          meta_status: string | null
          meta_submitted_at: string | null
          meta_synced_at: string | null
          meta_template_id: string | null
          nome: string
          slug: string
          updated_at: string
          vars: string[]
        }
        Insert: {
          ativo?: boolean
          buttons?: Json
          categoria?: string
          conteudo: string
          created_at?: string
          descricao?: string | null
          grupo?: string
          id?: string
          meta_category?: string | null
          meta_channel_id?: string | null
          meta_rejected_reason?: string | null
          meta_status?: string | null
          meta_submitted_at?: string | null
          meta_synced_at?: string | null
          meta_template_id?: string | null
          nome: string
          slug: string
          updated_at?: string
          vars?: string[]
        }
        Update: {
          ativo?: boolean
          buttons?: Json
          categoria?: string
          conteudo?: string
          created_at?: string
          descricao?: string | null
          grupo?: string
          id?: string
          meta_category?: string | null
          meta_channel_id?: string | null
          meta_rejected_reason?: string | null
          meta_status?: string | null
          meta_submitted_at?: string | null
          meta_synced_at?: string | null
          meta_template_id?: string | null
          nome?: string
          slug?: string
          updated_at?: string
          vars?: string[]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _vendor_check: {
        Args: { _codigo: string; _vendor_id: number }
        Returns: boolean
      }
      _vendor_norm: { Args: { value: string }; Returns: string }
      _wa_contact_variants: { Args: { _raw: string }; Returns: string[] }
      active_wa_flow_conversation_ids: {
        Args: never
        Returns: {
          conversation_id: string
        }[]
      }
      assign_vendor_for_channel: {
        Args: { _channel_id: string }
        Returns: number
      }
      cancel_active_wa_flow_runs: { Args: { _run_id: string }; Returns: number }
      cancel_expired_waiting_flow_runs: {
        Args: { _limit?: number; _older_than_seconds?: number }
        Returns: {
          channel_id: string
          contact_wa_id: string
          context: Json
          conversation_id: string | null
          created_at: string
          current_node_id: string | null
          error: string | null
          expires_at: string | null
          flow_id: string
          id: string
          status: string
          updated_at: string
          waiting_for: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "wa_flow_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_expired_timer_flow_runs: {
        Args: { _limit?: number }
        Returns: {
          channel_id: string
          contact_wa_id: string
          context: Json
          conversation_id: string | null
          created_at: string
          current_node_id: string | null
          error: string | null
          expires_at: string | null
          flow_id: string
          id: string
          status: string
          updated_at: string
          waiting_for: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "wa_flow_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_queued_flow_runs: {
        Args: { _limit?: number }
        Returns: {
          channel_id: string
          contact_wa_id: string
          context: Json
          conversation_id: string | null
          created_at: string
          current_node_id: string | null
          error: string | null
          expires_at: string | null
          flow_id: string
          id: string
          status: string
          updated_at: string
          waiting_for: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "wa_flow_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_stale_running_delay_flow_runs: {
        Args: { _limit?: number; _older_than_seconds?: number }
        Returns: {
          channel_id: string
          contact_wa_id: string
          context: Json
          conversation_id: string | null
          created_at: string
          current_node_id: string | null
          error: string | null
          expires_at: string | null
          flow_id: string
          id: string
          status: string
          updated_at: string
          waiting_for: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "wa_flow_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_stale_running_send_flow_runs: {
        Args: { _limit?: number; _older_than_seconds?: number }
        Returns: {
          channel_id: string
          contact_wa_id: string
          context: Json
          conversation_id: string | null
          created_at: string
          current_node_id: string | null
          error: string | null
          expires_at: string | null
          flow_id: string
          id: string
          status: string
          updated_at: string
          waiting_for: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "wa_flow_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      generate_ht_team_codigo: { Args: never; Returns: string }
      generate_vendedor_codigo: { Args: never; Returns: string }
      get_hall_of_fame_mes: { Args: never; Returns: Json }
      get_metas_coletivas_mes: { Args: never; Returns: Json }
      get_ranking_tv_stats: {
        Args: { _from?: string; _to?: string }
        Returns: Json
      }
      get_vendor_stats: {
        Args: { _from?: string; _to?: string; _utm: string }
        Returns: Json
      }
      load_wa_channel_credentials: {
        Args: { _channel_id: string }
        Returns: {
          id: string
          metadata: Json
          phone_number_id: string
          token: string
        }[]
      }
      load_wa_flow: {
        Args: { _flow_id: string }
        Returns: {
          ativo: boolean
          created_at: string
          created_by: string | null
          descricao: string | null
          edges: Json
          entry_node_id: string | null
          folder: string | null
          id: string
          nodes: Json
          nome: string
          operacao_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "wa_flows"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      login_ht_team_by_codigo: { Args: { _codigo: string }; Returns: Json }
      login_vendedor_by_codigo: { Args: { _codigo: string }; Returns: Json }
      submit_ht_quiz_submission: {
        Args: {
          _email: string
          _fbc: string
          _fbclid: string
          _fbp: string
          _gclid: string
          _instagram: string
          _nome: string
          _raw: Json
          _respostas: Json
          _session_id: string
          _status: string
          _token_hash: string
          _utm_campaign: string
          _utm_content: string
          _utm_medium: string
          _utm_source: string
          _whatsapp: string
        }
        Returns: {
          error: string
          id: string
          ok: boolean
          received_at: string
        }[]
      }
      update_wa_flow_run: {
        Args: { _patch?: Json; _run_id: string }
        Returns: boolean
      }
      vendor_active_wa_flow_conversation_ids: {
        Args: { _codigo: string; _vendor_id: number }
        Returns: {
          conversation_id: string
        }[]
      }
      vendor_allowed_channel_ids: {
        Args: { _codigo: string; _vendor_id: number }
        Returns: string[]
      }
      vendor_allowed_workspace_ids: {
        Args: { _codigo: string; _vendor_id: number }
        Returns: string[]
      }
      vendor_apply_wa_reaction: {
        Args: {
          _codigo: string
          _emoji: string
          _message_id: string
          _response_id: string
          _vendor_id: number
        }
        Returns: boolean
      }
      vendor_cancel_wa_flow_run: {
        Args: { _codigo: string; _run_id: string; _vendor_id: number }
        Returns: number
      }
      vendor_create_crm_tag: {
        Args: {
          _codigo: string
          _cor: string
          _nome: string
          _operacao: string
          _stage_id?: string
          _vendor_id: number
        }
        Returns: string
      }
      vendor_create_wa_flow: {
        Args: {
          _ativo?: boolean
          _codigo: string
          _descricao?: string
          _edges?: Json
          _entry_node_id?: string
          _folder?: string
          _nodes?: Json
          _nome: string
          _operacao_id?: string
          _vendor_id: number
        }
        Returns: {
          ativo: boolean
          created_at: string
          created_by: string | null
          descricao: string | null
          edges: Json
          entry_node_id: string | null
          folder: string | null
          id: string
          nodes: Json
          nome: string
          operacao_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "wa_flows"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      vendor_create_wa_flow_run: {
        Args: {
          _channel_id?: string
          _codigo: string
          _contact_wa_id?: string
          _context?: Json
          _conversation_id?: string
          _current_node_id?: string
          _flow_id: string
          _vendor_id: number
        }
        Returns: {
          channel_id: string
          contact_wa_id: string
          context: Json
          conversation_id: string | null
          created_at: string
          current_node_id: string | null
          error: string | null
          expires_at: string | null
          flow_id: string
          id: string
          status: string
          updated_at: string
          waiting_for: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "wa_flow_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      vendor_delete_checkout: {
        Args: { _codigo: string; _id: string; _vendor_id: number }
        Returns: boolean
      }
      vendor_delete_crm_stage: {
        Args: { _codigo: string; _id: string; _vendor_id: number }
        Returns: boolean
      }
      vendor_delete_crm_tag: {
        Args: { _codigo: string; _id: string; _vendor_id: number }
        Returns: boolean
      }
      vendor_delete_wa_flow: {
        Args: { _codigo: string; _flow_id: string; _vendor_id: number }
        Returns: boolean
      }
      vendor_delete_wa_message: {
        Args: { _codigo: string; _message_id: string; _vendor_id: number }
        Returns: {
          channel_id: string
          direction: string
          id: string
          wa_message_id: string
        }[]
      }
      vendor_edit_wa_message: {
        Args: {
          _codigo: string
          _message_id: string
          _new_text: string
          _vendor_id: number
        }
        Returns: {
          channel_id: string
          contact_wa_id: string
          id: string
          prev_text: string
          wa_message_id: string
        }[]
      }
      vendor_get_flow: {
        Args: { _codigo: string; _flow_id: string; _vendor_id: number }
        Returns: {
          ativo: boolean
          created_at: string
          created_by: string | null
          descricao: string | null
          edges: Json
          entry_node_id: string | null
          folder: string | null
          id: string
          nodes: Json
          nome: string
          operacao_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "wa_flows"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      vendor_get_wa_message_for_react: {
        Args: { _codigo: string; _message_id: string; _vendor_id: number }
        Returns: {
          channel_id: string
          contact_wa_id: string
          conversation_id: string
          id: string
          raw: Json
          wa_message_id: string
        }[]
      }
      vendor_insert_wa_flow_execution: {
        Args: {
          _codigo: string
          _duration_ms?: number
          _error?: string
          _node_id: string
          _node_type: string
          _output?: Json
          _run_id: string
          _status: string
          _vendor_id: number
        }
        Returns: string
      }
      vendor_insert_wa_message: {
        Args: {
          _caption?: string
          _channel_id: string
          _codigo: string
          _conversation_id: string
          _direction?: string
          _from_wa_id?: string
          _media_filename?: string
          _media_url?: string
          _msg_type?: string
          _raw?: Json
          _status?: string
          _text_body?: string
          _to_wa_id?: string
          _vendor_id: number
          _wa_message_id?: string
        }
        Returns: string
      }
      vendor_list_active_wa_flow_runs: {
        Args: { _codigo: string; _conversation_id: string; _vendor_id: number }
        Returns: {
          current_node_id: string
          error: string
          expires_at: string
          flow_id: string
          flow_nome: string
          id: string
          status: string
          updated_at: string
          waiting_for: string
        }[]
      }
      vendor_list_checkouts: {
        Args: { _codigo: string; _vendor_id: number }
        Returns: {
          created_at: string
          id: string
          image_path: string | null
          link: string
          mensagem: string
          nome: string
          ordem: number
          updated_at: string
          vendedor_id: number
        }[]
        SetofOptions: {
          from: "*"
          to: "vendor_checkouts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      vendor_list_crm_experts: {
        Args: { _codigo: string; _vendor_id: number }
        Returns: {
          ativo: boolean | null
          created_at: string | null
          crm_api_key: string | null
          drive_url: string | null
          foto_url: string | null
          id: number
          meta_mensal: number
          meta_nivel1: number
          meta_nivel2: number
          meta_nivel3: number
          nome: string
          quiz_api_key: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "experts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      vendor_list_crm_leads: {
        Args: { _codigo: string; _vendor_id: number }
        Returns: {
          created_at: string
          dados: Json | null
          email: string | null
          expert: string | null
          fonte: string | null
          id: string
          nome: string
          notas: string | null
          ordem: number | null
          responsavel_nome: string | null
          responsavel_utm: string | null
          status: string
          tags: string[] | null
          telefone: string | null
          ultima_interacao: string | null
          updated_at: string
          valor_estimado: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "crm_leads"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      vendor_list_crm_stages: {
        Args: { _codigo: string; _operacao?: string; _vendor_id: number }
        Returns: {
          cor: string
          created_at: string
          id: string
          nome: string
          operacao: string
          ordem: number
        }[]
        SetofOptions: {
          from: "*"
          to: "crm_stages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      vendor_list_crm_tags: {
        Args: { _codigo: string; _operacao?: string; _vendor_id: number }
        Returns: {
          cor: string
          created_at: string
          id: string
          nome: string
          operacao: string
          stage_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "crm_tags"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      vendor_list_flows: {
        Args: { _codigo: string; _vendor_id: number }
        Returns: {
          ativo: boolean
          created_at: string
          created_by: string | null
          descricao: string | null
          edges: Json
          entry_node_id: string | null
          folder: string | null
          id: string
          nodes: Json
          nome: string
          operacao_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "wa_flows"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      vendor_list_wa_channels: {
        Args: { _codigo: string; _vendor_id: number }
        Returns: {
          app_source: string
          connect_url: string | null
          created_at: string | null
          display_phone_number: string | null
          id: string
          kind: string
          metadata: Json
          name: string
          operacao_id: string | null
          phone_number_id: string | null
          quality_rating: string | null
          status: string | null
          synced_at: string
          token: string | null
          type: string
          updated_at: string
          verified_name: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "wa_channels"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      vendor_list_wa_conversations: {
        Args: { _codigo: string; _operacao_id?: string; _vendor_id: number }
        Returns: {
          archived_at: string | null
          assigned_vendor_id: number | null
          channel_id: string
          contact_avatar_url: string | null
          contact_name: string | null
          contact_wa_id: string
          created_at: string
          id: string
          last_message_at: string
          last_message_direction: string | null
          last_message_preview: string | null
          last_message_status: string | null
          notes: string | null
          operacao_id: string | null
          phone_number_id: string | null
          tags: string[]
          unread_count: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "wa_conversations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      vendor_list_wa_flow_triggers: {
        Args: { _codigo: string; _flow_id: string; _vendor_id: number }
        Returns: {
          ativo: boolean
          channel_id: string | null
          created_at: string
          days_of_week: number[] | null
          flow_id: string
          id: string
          match_mode: string
          time_end: string | null
          time_start: string | null
          timezone: string
          tipo: string
          valor: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "wa_flow_triggers"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      vendor_list_wa_messages: {
        Args: { _codigo: string; _conversation_id: string; _vendor_id: number }
        Returns: {
          caption: string | null
          channel_id: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          direction: string
          error_message: string | null
          from_wa_id: string | null
          id: string
          media_filename: string | null
          media_id: string | null
          media_mime: string | null
          media_url: string | null
          msg_type: string
          raw: Json | null
          reply_to: string | null
          sent_by: string | null
          status: string | null
          text_body: string | null
          to_wa_id: string | null
          wa_message_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "wa_messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      vendor_list_x1_sales: {
        Args: {
          _codigo: string
          _from?: string
          _to?: string
          _vendor_id: number
        }
        Returns: {
          Data: string
          Evento: string
          nome_expert: string
          Produto: string
          Ticket: string
          tipo_produto: string
          UTM: string
        }[]
      }
      vendor_list_x1_wa_conversations: {
        Args: {
          _codigo: string
          _from?: string
          _operacao_id?: string
          _to?: string
          _vendor_id: number
        }
        Returns: {
          archived_at: string | null
          assigned_vendor_id: number | null
          channel_id: string
          contact_avatar_url: string | null
          contact_name: string | null
          contact_wa_id: string
          created_at: string
          id: string
          last_message_at: string
          last_message_direction: string | null
          last_message_preview: string | null
          last_message_status: string | null
          notes: string | null
          operacao_id: string | null
          phone_number_id: string | null
          tags: string[]
          unread_count: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "wa_conversations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      vendor_list_x1_wa_messages: {
        Args: {
          _codigo: string
          _from?: string
          _operacao_id?: string
          _to?: string
          _vendor_id: number
        }
        Returns: {
          caption: string | null
          channel_id: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          direction: string
          error_message: string | null
          from_wa_id: string | null
          id: string
          media_filename: string | null
          media_id: string | null
          media_mime: string | null
          media_url: string | null
          msg_type: string
          raw: Json | null
          reply_to: string | null
          sent_by: string | null
          status: string | null
          text_body: string | null
          to_wa_id: string | null
          wa_message_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "wa_messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      vendor_mark_conversation_read: {
        Args: { _codigo: string; _conversation_id: string; _vendor_id: number }
        Returns: boolean
      }
      vendor_replace_wa_flow_triggers: {
        Args: {
          _codigo: string
          _flow_id: string
          _triggers?: Json
          _vendor_id: number
        }
        Returns: boolean
      }
      vendor_resolve_wa_conversation: {
        Args: {
          _channel_id?: string
          _codigo: string
          _contact_wa_id?: string
          _conversation_id?: string
          _vendor_id: number
        }
        Returns: {
          archived_at: string | null
          assigned_vendor_id: number | null
          channel_id: string
          contact_avatar_url: string | null
          contact_name: string | null
          contact_wa_id: string
          created_at: string
          id: string
          last_message_at: string
          last_message_direction: string | null
          last_message_preview: string | null
          last_message_status: string | null
          notes: string | null
          operacao_id: string | null
          phone_number_id: string | null
          tags: string[]
          unread_count: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "wa_conversations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      vendor_touch_wa_conversation: {
        Args: {
          _codigo: string
          _conversation_id: string
          _direction?: string
          _preview?: string
          _vendor_id: number
        }
        Returns: boolean
      }
      vendor_update_conversation_notes: {
        Args: {
          _codigo: string
          _conversation_id: string
          _notes: string
          _vendor_id: number
        }
        Returns: boolean
      }
      vendor_update_conversation_tags: {
        Args: {
          _codigo: string
          _conversation_id: string
          _tags: string[]
          _vendor_id: number
        }
        Returns: boolean
      }
      vendor_update_crm_lead_stage: {
        Args: {
          _codigo: string
          _lead_id: string
          _status: string
          _vendor_id: number
        }
        Returns: boolean
      }
      vendor_update_crm_tag: {
        Args: {
          _clear_stage?: boolean
          _codigo: string
          _cor?: string
          _id: string
          _nome?: string
          _stage_id?: string
          _vendor_id: number
        }
        Returns: boolean
      }
      vendor_update_wa_flow: {
        Args: {
          _ativo?: boolean
          _codigo: string
          _edges?: Json
          _entry_node_id?: string
          _flow_id: string
          _folder?: string
          _nodes?: Json
          _nome?: string
          _operacao_id?: string
          _set_ativo?: boolean
          _set_edges?: boolean
          _set_entry_node_id?: boolean
          _set_folder?: boolean
          _set_nodes?: boolean
          _set_operacao?: boolean
          _vendor_id: number
        }
        Returns: boolean
      }
      vendor_update_wa_flow_run: {
        Args: {
          _codigo: string
          _patch?: Json
          _run_id: string
          _vendor_id: number
        }
        Returns: boolean
      }
      vendor_update_wa_message_status: {
        Args: {
          _codigo: string
          _message_id: string
          _raw?: Json
          _status?: string
          _vendor_id: number
          _wa_message_id?: string
        }
        Returns: boolean
      }
      vendor_upsert_checkout: {
        Args: {
          _codigo: string
          _id: string
          _image_path?: string
          _link: string
          _mensagem: string
          _nome: string
          _ordem: number
          _vendor_id: number
        }
        Returns: string
      }
      vendor_upsert_crm_stage: {
        Args: {
          _codigo: string
          _cor: string
          _id: string
          _nome: string
          _operacao: string
          _ordem: number
          _vendor_id: number
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
