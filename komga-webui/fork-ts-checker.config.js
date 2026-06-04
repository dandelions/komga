module.exports = {
  typescript: {
    memoryLimit: Number(process.env.FORK_TS_CHECKER_MEMORY_LIMIT || 4096),
  },
}
