// apps/mobile/app/sign-in.tsx
// Email code, one screen: an existing account gets a sign-in code, a new email gets a sign-up code.

import { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { isClerkAPIResponseError, useSignIn, useSignUp } from '@clerk/clerk-expo'
import { color, space, type } from '@/lib/theme'

type Step = { kind: 'email' } | { kind: 'code'; mode: 'sign-in' | 'sign-up' }

export default function SignIn() {
  const signIn = useSignIn()
  const signUp = useSignUp()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<Step>({ kind: 'email' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const message = (e: unknown) =>
    isClerkAPIResponseError(e) ? e.errors[0]?.longMessage ?? e.errors[0]?.message : 'Something went wrong'

  async function sendCode() {
    if (!signIn.isLoaded || !signUp.isLoaded) return
    setBusy(true)
    setError(null)
    try {
      const attempt = await signIn.signIn.create({ identifier: email.trim() })
      const factor = attempt.supportedFirstFactors?.find((f) => f.strategy === 'email_code')
      if (!factor || factor.strategy !== 'email_code') throw new Error('Email code sign-in is not enabled')
      await signIn.signIn.prepareFirstFactor({ strategy: 'email_code', emailAddressId: factor.emailAddressId })
      setStep({ kind: 'code', mode: 'sign-in' })
    } catch (e) {
      // No account for this email yet: sign up with the same code flow.
      if (isClerkAPIResponseError(e) && e.errors[0]?.code === 'form_identifier_not_found') {
        try {
          await signUp.signUp.create({ emailAddress: email.trim() })
          await signUp.signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
          setStep({ kind: 'code', mode: 'sign-up' })
        } catch (e2) {
          setError(message(e2))
        }
      } else {
        setError(e instanceof Error && !isClerkAPIResponseError(e) ? e.message : message(e))
      }
    } finally {
      setBusy(false)
    }
  }

  async function verify() {
    if (!signIn.isLoaded || !signUp.isLoaded || step.kind !== 'code') return
    setBusy(true)
    setError(null)
    try {
      if (step.mode === 'sign-in') {
        const done = await signIn.signIn.attemptFirstFactor({ strategy: 'email_code', code: code.trim() })
        if (done.status === 'complete') await signIn.setActive({ session: done.createdSessionId })
        else setError('That code did not finish signing in')
      } else {
        const done = await signUp.signUp.attemptEmailAddressVerification({ code: code.trim() })
        if (done.status === 'complete') await signUp.setActive({ session: done.createdSessionId })
        else setError('That code did not finish creating your account')
      }
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <View style={styles.body}>
        <Text style={type.title}>Ivy Wolf</Text>
        <Text style={[type.meta, styles.tagline]}>The object is for thinking. The platform is for what you thought.</Text>

        {step.kind === 'email' ? (
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={color.unsure}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={sendCode}
          />
        ) : (
          <>
            <Text style={type.meta}>We sent a code to {email.trim()}</Text>
            <TextInput
              style={styles.input}
              placeholder="6-digit code"
              placeholderTextColor={color.unsure}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              value={code}
              onChangeText={setCode}
              onSubmitEditing={verify}
            />
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]}
          onPress={step.kind === 'email' ? sendCode : verify}
          disabled={busy}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{step.kind === 'email' ? 'Send code' : 'Continue'}</Text>
          )}
        </Pressable>

        {step.kind === 'code' ? (
          <Pressable onPress={() => { setStep({ kind: 'email' }); setCode('') }}>
            <Text style={[type.meta, styles.back]}>Use a different email</Text>
          </Pressable>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: space.xl, gap: space.m },
  tagline: { marginBottom: space.xl },
  input: {
    backgroundColor: color.card,
    borderColor: color.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: space.l,
    paddingVertical: 14,
    fontSize: 17,
    color: color.ink,
  },
  error: { color: color.accent, fontSize: 14 },
  button: {
    backgroundColor: color.ink,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: space.s,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  back: { textAlign: 'center', marginTop: space.m },
})
