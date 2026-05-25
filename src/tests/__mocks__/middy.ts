const middy = () => {
  const instance = {
    use: () => instance,
    handler: (fn: unknown) => fn,
  }
  return instance
}
export default middy
