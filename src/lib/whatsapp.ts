import { createClient } from '@/lib/supabase-browser'

/**
 * Fetch a WhatsApp template by notification_type and render it
 * with the provided placeholder values.
 * Falls back to the fallbackMessage if the template is not found or inactive.
 */
export async function renderWhatsAppTemplate(
  notificationType: string,
  placeholders: Record<string, string>,
  fallbackMessage: string
): Promise<string> {
  try {
    const supabase = createClient()
    const { data } = await supabase
      .from('whatsapp_templates')
      .select('template, is_active')
      .eq('notification_type', notificationType)
      .eq('is_active', true)
      .single()

    if (!data?.template) return fallbackMessage

    let message = data.template
    Object.entries(placeholders).forEach(([key, value]) => {
      message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '')
    })
    return message
  } catch {
    return fallbackMessage
  }
}
