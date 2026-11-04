$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$tempDir = Join-Path $repoRoot 'supabase/.temp'
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
$credentialPath = Join-Path $tempDir 'haldiram-demo-credentials.txt'
$queryPath = Join-Path $tempDir 'haldiram-demo-users.sql'

if (Test-Path -LiteralPath $credentialPath) {
  throw "Demo credential file already exists: $credentialPath. Accounts may already have been created."
}

$people = @(
  [pscustomobject]@{ Key = 'OWNER'; Email = 'haldiram.owner@stocksetu.demo'; Name = 'Demo Business Owner'; Role = 'admin'; Location = 'all' }
  [pscustomobject]@{ Key = 'WAREHOUSE'; Email = 'haldiram.warehouse@stocksetu.demo'; Name = 'Demo Warehouse Manager'; Role = 'warehouse'; Location = 'Central Warehouse Okhla' }
  [pscustomobject]@{ Key = 'CP'; Email = 'haldiram.cp@stocksetu.demo'; Name = 'Demo CP Outlet Manager'; Role = 'outlet'; Location = 'Outlet Connaught Place' }
  [pscustomobject]@{ Key = 'NOIDA'; Email = 'haldiram.noida@stocksetu.demo'; Name = 'Demo Noida Outlet Manager'; Role = 'outlet'; Location = 'Outlet Noida Sector 18' }
  [pscustomobject]@{ Key = 'STAFF'; Email = 'haldiram.staff@stocksetu.demo'; Name = 'Demo Outlet Staff'; Role = 'staff'; Location = 'Outlet Connaught Place' }
)

$passwords = @{}
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
foreach ($person in $people) {
  $bytes = New-Object byte[] 24
  $rng.GetBytes($bytes)
  $passwords[$person.Key] = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}
$rng.Dispose()

$sql = @'
begin;
do $demo$
declare
  v_platform uuid;
  v_org uuid;
  v_wh uuid;
  v_cp uuid;
  v_noida uuid;
begin
  select id into v_platform from auth.users where lower(email) = 'prakashgovtportal@gmail.com' and email_confirmed_at is not null;
  if v_platform is null then raise exception 'Verified platform owner not found'; end if;
  perform set_config('request.jwt.claim.sub', v_platform::text, true);
  if not app.is_platform_admin() then raise exception 'Platform owner flag is missing'; end if;

  select id into v_org from public.organisations where name = 'Haldiram (Demo)';
  if v_org is null then raise exception 'Haldiram demo workspace not found'; end if;
  if exists (select 1 from auth.users where lower(email) in (
    'haldiram.owner@stocksetu.demo', 'haldiram.warehouse@stocksetu.demo',
    'haldiram.cp@stocksetu.demo', 'haldiram.noida@stocksetu.demo',
    'haldiram.staff@stocksetu.demo')) then
    raise exception 'A Haldiram demo login already exists; refusing to replace credentials';
  end if;

  select id into v_wh from public.locations where org_id = v_org and name = 'Central Warehouse Okhla';
  select id into v_cp from public.locations where org_id = v_org and name = 'Outlet Connaught Place';
  select id into v_noida from public.locations where org_id = v_org and name = 'Outlet Noida Sector 18';
  if v_wh is null or v_cp is null or v_noida is null then raise exception 'Demo locations incomplete'; end if;

  perform public.create_user_account(v_org, 'haldiram.owner@stocksetu.demo', 'Demo Business Owner', '__PWD_OWNER__', 'admin', null);
  perform public.create_user_account(v_org, 'haldiram.warehouse@stocksetu.demo', 'Demo Warehouse Manager', '__PWD_WAREHOUSE__', 'warehouse', array[v_wh]::uuid[]);
  perform public.create_user_account(v_org, 'haldiram.cp@stocksetu.demo', 'Demo CP Outlet Manager', '__PWD_CP__', 'outlet', array[v_cp]::uuid[]);
  perform public.create_user_account(v_org, 'haldiram.noida@stocksetu.demo', 'Demo Noida Outlet Manager', '__PWD_NOIDA__', 'outlet', array[v_noida]::uuid[]);
  perform public.create_user_account(v_org, 'haldiram.staff@stocksetu.demo', 'Demo Outlet Staff', '__PWD_STAFF__', 'staff', array[v_cp]::uuid[]);
end;
$demo$;
commit;
'@

foreach ($person in $people) {
  $sql = $sql.Replace("__PWD_$($person.Key)__", $passwords[$person.Key])
}

$credentialLines = @(
  'StockSetu Haldiram (Demo) logins. Generated passwords; share only with authorised testers.'
  'Site: https://stocksetu-seven.vercel.app/login'
  ''
)
foreach ($person in $people) {
  $credentialLines += "$($person.Role) | $($person.Location) | $($person.Email) | $($passwords[$person.Key])"
}

$credentialLines | Set-Content -LiteralPath $credentialPath -Encoding utf8
$sql | Set-Content -LiteralPath $queryPath -Encoding utf8

try {
  Push-Location $repoRoot
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = (& npx supabase db query --linked --agent no --output-format text --file $queryPath 2>&1 | Out-String)
    $queryExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  foreach ($password in $passwords.Values) { $output = $output.Replace($password, '[REDACTED]') }
  if ($queryExitCode -ne 0) { throw "Demo user creation failed: $output" }
  Write-Output "Created $($people.Count) demo logins. Credentials: $credentialPath"
} finally {
  Pop-Location
  Remove-Item -LiteralPath $queryPath -ErrorAction SilentlyContinue
}
