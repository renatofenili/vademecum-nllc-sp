/**
 * Maps raw database/auth error messages to user-friendly descriptions.
 * Prevents internal schema details from leaking to the UI.
 */
export function getSafeErrorMessage(
  error: unknown,
  context?: { operation?: string; entity?: string }
): string {
  const msg =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: string }).message)
      : String(error ?? '');

  // Auth errors
  if (msg.includes('Invalid login credentials'))
    return 'Email ou senha incorretos.';
  if (msg.includes('Email not confirmed'))
    return 'Verifique seu email para confirmar sua conta.';
  if (msg.includes('User already registered'))
    return 'Este email já está em uso. Tente fazer login.';

  // Database constraint errors
  if (msg.includes('foreign key') || msg.includes('constraint'))
    return 'Operação não permitida devido a dados relacionados.';
  if (msg.includes('not-null') || msg.includes('null value'))
    return 'Todos os campos obrigatórios devem ser preenchidos.';
  if (msg.includes('unique') || msg.includes('duplicate'))
    return 'Já existe um registro com esses dados.';
  if (
    msg.includes('permission denied') ||
    msg.includes('RLS') ||
    msg.includes('row-level security') ||
    msg.includes('policy')
  )
    return 'Você não tem permissão para realizar esta operação.';

  // Storage errors
  if (msg.includes('storage') && context?.operation === 'upload')
    return 'Erro ao fazer upload do arquivo. Verifique o tamanho e o formato.';

  // Generic fallback
  if (context?.operation && context?.entity)
    return `Erro ao ${context.operation} ${context.entity}. Tente novamente.`;

  return 'Ocorreu um erro ao processar sua solicitação. Tente novamente.';
}
