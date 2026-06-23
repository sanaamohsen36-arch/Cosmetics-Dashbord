return () => {
  if (supabase) {
    void supabase.removeChannel(channel);
  }
};
