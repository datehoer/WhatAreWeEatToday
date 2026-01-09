import React, { useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Mail, Lock, ChefHat } from 'lucide-react'
import { ALLOWED_EMAIL_SUFFIX, isEmailAllowed } from '../config/auth'
import { supabase } from '../services/supabaseClient'

type Props = {
  user: User | null
  authLoading: boolean
  onLoginSuccess: () => void
  onToast: (msg: string) => void
}

export const LoginPage: React.FC<Props> = ({
  user,
  authLoading,
  onLoginSuccess,
  onToast
}) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email])
  const canSubmit = Boolean(
    normalizedEmail &&
      password &&
      password.length >= 6 &&
      isEmailAllowed(normalizedEmail)
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!normalizedEmail) return onToast('请输入邮箱')
    if (!ALLOWED_EMAIL_SUFFIX) return onToast('邮箱/密码错误')
    if (!ALLOWED_EMAIL_SUFFIX.startsWith('@'))
      return onToast('邮箱/密码错误')
    if (!isEmailAllowed(normalizedEmail))
      return onToast(`邮箱/密码错误`)
    if (!password) return onToast('请输入密码')
    if (password.length < 6) return onToast('密码至少 6 位')

    setSubmitting(true)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password
        })
        if (error) {
          onToast('邮箱或密码不正确')
          return
        }
        onToast('登录成功')
        onLoginSuccess()
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password
        })
        if (error) {
          onToast('注册失败，请检查邮箱后缀与密码规则')
          return
        }

        if (data.session) {
          onToast('注册并登录成功')
          onLoginSuccess()
        } else {
          onToast('注册成功，请登录')
        }
      }
    } catch (e: any) {
      onToast(e?.message || '操作失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-white">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
          <p className="mt-4 text-gray-500">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-orange-50 via-white to-orange-50 px-4">
      {/* Logo 和标题 */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-orange-400 to-orange-600 rounded-3xl shadow-lg mb-4">
          <ChefHat className="text-white w-10 h-10" />
        </div>
        <h1 className="text-3xl font-bold text-gray-800 mb-2">今天吃什么</h1>
        <p className="text-gray-500 text-sm">发现身边的美食，和饭搭子一起投票</p>
      </div>

      {/* 登录/注册卡片 */}
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
        {/* 模式切换 */}
        <div className="flex p-1 bg-gray-100 m-4 rounded-2xl">
          <button
            onClick={() => setMode('signin')}
            className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all ${
              mode === 'signin'
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            登录
          </button>
          <button
            onClick={() => setMode('signup')}
            className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all ${
              mode === 'signup'
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            注册
          </button>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          <label className="block">
            <div className="text-xs font-semibold text-gray-600 mb-2 ml-1">邮箱</div>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={`example@gmail.com`}
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3.5 px-4 pl-12 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                autoComplete="email"
                inputMode="email"
              />
            </div>
          </label>

          <label className="block">
            <div className="text-xs font-semibold text-gray-600 mb-2 ml-1">密码</div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 位"
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3.5 px-4 pl-12 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={submitting || !canSubmit}
            className="w-full py-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-2xl font-bold shadow-lg shadow-orange-500/30 hover:shadow-orange-500/40 hover:from-orange-600 hover:to-orange-700 disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none transition-all mt-6"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                处理中...
              </span>
            ) : mode === 'signin' ? (
              '登录'
            ) : (
              '注册'
            )}
          </button>
        </form>
      </div>

      {/* 底部提示 */}
      <div className="mt-8 text-center">
        <p className="text-xs text-gray-400">
          登录即表示同意我们的服务条款和隐私政策
        </p>
      </div>
    </div>
  )
}
