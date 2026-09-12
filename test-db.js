
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient("https://bodmefskcvzfbdgplqhm.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvZG1lZnNrY3Z6ZmJkZ3BscWhtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTM1NDQxNCwiZXhwIjoyMDk2OTMwNDE0fQ.Uu4xuAs_1Z8xa87svNu0fVXMbCQhp78yRBJGbE5G4j0");
(async () => {
  const { data, error } = await supabase.from("bank_account_ledger").select("*").limit(10);
  console.log(JSON.stringify(data, null, 2), error);
})();

