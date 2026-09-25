import { useLoginPageContext } from '../context'

export function LoginFeedback() {
  const state = useLoginPageContext()

  return (
    <>
      <p className="hidden group-data-[feedback=success]:block" role="status">
        {state.message}
      </p>
      <p className="hidden group-data-[feedback=error]:block" role="alert">
        {state.error}
      </p>
    </>
  )
}
