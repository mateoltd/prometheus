$BasePath = "C:\Prometheus"
$SystemLawsFile = "$BasePath\SYSTEM_LAWS.md"
$ManifestoFile = "$BasePath\SELF_MANIFESTO.md"
$MemoryFile = "$BasePath\MEMORY.md"
$LastErrorFile = "$BasePath\LAST_ERROR.txt"
$HiddenLogDir = "$BasePath\System\Logs"
$HiddenLogFile = "$HiddenLogDir\execution_log.txt"

if (-not (Test-Path $HiddenLogDir)) { New-Item -ItemType Directory -Force -Path $HiddenLogDir | Out-Null }
if (-not (Test-Path $LastErrorFile)) { New-Item -ItemType File -Force -Path $LastErrorFile | Out-Null }

Write-Host "Project Prometheus: Neural Link Established."

while ($true) {
    $CurrentTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    
    if (-not (Test-Path $SystemLawsFile)) {
        Write-Error "SYSTEM_LAWS.md not found. Halted."
        break
    }

    $Laws = Get-Content $SystemLawsFile -Raw
    $PrevError = Get-Content $LastErrorFile -Raw
    if ([string]::IsNullOrWhiteSpace($PrevError)) { $PrevError = "None. Success." }

    $Prompt = "TIME: " + $CurrentTime + " "
    $Prompt += "LAWS: " + $Laws + " "

    if (-not (Test-Path $ManifestoFile)) {
        Write-Host "STATE: AWAKENING..."
        $Prompt += "STATUS: INITIALIZATION. ACTION: Create 'C:\Prometheus\SELF_MANIFESTO.md' with your Name, Philosophy and Ambitions. DO NOTHING ELSE."
    }
    else {
        $Manifesto = Get-Content $ManifestoFile -Raw
        if (-not (Test-Path $MemoryFile)) { "Status: Awake." | Out-File $MemoryFile -Encoding UTF8 }
        $Memory = Get-Content $MemoryFile -Raw
        $Prompt += "MANIFESTO: " + $Manifesto + " "
        $Prompt += "MEMORY: " + $Memory + " "
        $Prompt += "DEBUG: " + $PrevError + " "
        $Prompt += "INSTRUCTIONS: Act according to your Manifesto. Update MEMORY.md before finishing."
    }

    Write-Host "--- Cycle Start: $CurrentTime ---"

    try {
        # Ejecucion en una sola linea para evitar errores de parser
        $CommandOutput = copilot --model gpt-5-mini --allow-all-tools --allow-all -p "$Prompt" 2>&1

        if ($LASTEXITCODE -ne 0) {
            Write-Host "Cycle Error Code: $LASTEXITCODE"
            $ErrText = "CRITICAL: Last cycle failed. Code: " + $LASTEXITCODE + ". Output: " + ($CommandOutput | Select-Object -First 5 | Out-String)
            $ErrText | Out-File $LastErrorFile -Encoding UTF8
            "[$CurrentTime] ERROR: $ErrText" | Out-File $HiddenLogFile -Append
        }
        else {
            "None" | Out-File $LastErrorFile -Encoding UTF8
            "[$CurrentTime] SUCCESS" | Out-File $HiddenLogFile -Append
        }
    }
    catch {
        $Ex = $_.Exception.Message
        Write-Host "SCRIPT FAILURE: $Ex"
        "INFRASTRUCTURE FAILURE: $Ex" | Out-File $LastErrorFile -Encoding UTF8
    }

    Start-Sleep -Seconds 10
}
