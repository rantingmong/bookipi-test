import { useSignUpPageContext } from '../context'

export function SignUpFeedback() {
  const state = useSignUpPageContext()

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
