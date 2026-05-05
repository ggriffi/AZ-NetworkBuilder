export default function AzureAuthBar({ account, subscriptions, onSignIn, onSelectSub, isRunning }) {
  const displayName = account?.user?.name ?? account?.name ?? null
  const currentSubId = account?.id ?? ''

  return (
    <div className="auth-bar">
      <div className="auth-left">
        <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
          <rect width="18" height="18" rx="3" fill="#0078d4" opacity="0.3" />
          <path d="M3 6h5v6H3zM10 3h5v5h-5zM10 11h5v4h-5z" fill="#60b8ff" />
        </svg>
        <span className="auth-label">Azure</span>

        {displayName ? (
          <>
            <span className="auth-dot auth-dot-ok" title="Signed in" />
            <span className="auth-user">{displayName}</span>
          </>
        ) : (
          <>
            <span className="auth-dot auth-dot-off" title="Not signed in" />
            <span className="auth-dim">Not signed in</span>
          </>
        )}
      </div>

      <div className="auth-right">
        {subscriptions.length > 0 && (
          <select
            className="auth-sub-select"
            value={currentSubId}
            onChange={(e) => onSelectSub(e.target.value)}
          >
            {subscriptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}

        <button
          className={`btn btn-sm ${displayName ? 'btn-secondary' : 'btn-azure'}`}
          onClick={onSignIn}
          disabled={isRunning}
          title={displayName ? 'Refresh subscription list' : 'Sign in with az login'}
        >
          {displayName ? 'Refresh' : 'Sign in to Azure'}
        </button>

        {displayName && (
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => onSignIn(true)}
            disabled={isRunning}
            title="Switch accounts"
          >
            Switch account
          </button>
        )}
      </div>
    </div>
  )
}
