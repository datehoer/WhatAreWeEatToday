import React, { useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { LogOut, Mail, Lock } from 'lucide-react'
import { ALLOWED_EMAIL_SUFFIX, isEmailAllowed } from '../config/auth'
import { supabase } from '../services/supabaseClient'

type Props = {
  user: User | null
  authLoading: boolean
  onToast: (msg: string) => void
}

export const AuthPanel: React.FC<Props> = ({
  user,
  authLoading,
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

  const handleSignOut = async () => {
    setSubmitting(true)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      onToast('已退出登录')
    } catch (e: any) {
      onToast(e?.message || '退出失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

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
          // 不暴露“邮箱是否存在”等细节，避免账号枚举
          onToast('邮箱或密码不正确')
          return
        }
        onToast('登录成功')
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password
        })
        if (error) {
          // 注册失败保持通用提示：不确认邮箱状态、不泄露策略细节
          onToast('注册失败，请检查邮箱后缀与密码规则')
          return
        }

        if (data.session) {
          onToast('注册并登录成功')
        } else {
          // 你已关闭邮箱确认时通常不会走到这里，但兼容一下
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
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="text-gray-500 text-sm">认证状态加载中...</div>
      </div>
    )
  }

  if (user) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-gray-400 mb-1">已登录</div>
            <div className="text-sm font-semibold text-gray-800 break-all">
              {user.email || '（无邮箱）'}
            </div>
          </div>
          <button
            onClick={handleSignOut}
            disabled={submitting}
            className="text-xs text-gray-600 font-semibold px-3 py-2 bg-gray-100 rounded-xl hover:bg-gray-200 disabled:opacity-60 flex items-center gap-1"
          >
            <LogOut size={14} /> 退出
          </button>
        </div>

        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
          <div className="text-xs text-gray-400 mb-1">用户 ID</div>
          <div className="font-mono text-sm select-all break-all">{user.id}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-bold text-gray-800">登录 / 注册</div>
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setMode('signin')}
            className={`px-3 py-1 rounded-full font-semibold ${
              mode === 'signin'
                ? 'bg-orange-100 text-orange-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            登录
          </button>
          <button
            onClick={() => setMode('signup')}
            className={`px-3 py-1 rounded-full font-semibold ${
              mode === 'signup'
                ? 'bg-orange-100 text-orange-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            注册
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block">
          <div className="text-xs text-gray-500 mb-1">邮箱</div>
          <div className="relative">
            <Mail className="absolute left-3 top-3.5 text-gray-400 w-4 h-4" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-white border border-gray-200 rounded-xl py-3 px-4 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              autoComplete="email"
              inputMode="email"
            />
          </div>
        </label>

        <label className="block">
          <div className="text-xs text-gray-500 mb-1">密码</div>
          <div className="relative">
            <Lock className="absolute left-3 top-3.5 text-gray-400 w-4 h-4" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              className="w-full bg-white border border-gray-200 rounded-xl py-3 px-4 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </div>
        </label>

        <button
          type="submit"
          disabled={submitting || !canSubmit}
          className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold shadow-sm hover:bg-orange-600 disabled:opacity-60"
        >
          {submitting ? '处理中...' : mode === 'signin' ? '登录' : '注册'}
        </button>
      </form>
    </div>
  )
}
