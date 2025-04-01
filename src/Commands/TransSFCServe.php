<?php

namespace TransSFC\TransSFC\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Process;
use Symfony\Component\Process\Process as SymfonyProcess;

class TransSFCServe extends Command
{
    public $signature = 'lang:serve';
    public $description = 'Run Node.js script to watch and update translations';

    public function handle(): int
    {
        $nodeScriptPath = base_path('vendor/iammarjamal/transsfc/src/Watcher/index.mjs');

        if (!file_exists($nodeScriptPath)) {
            $this->error("Node.js script not found at: {$nodeScriptPath}");
            return self::FAILURE;
        }

        // Create a process with real-time output
        $process = new SymfonyProcess(['node', $nodeScriptPath]);
        $process->setTimeout(null); // No timeout (infinite)
        $process->start();

        // Read the output while running
        foreach ($process as $type => $data) {
            if ($process::OUT === $type) {
                $this->info(trim($data)); // Show console.log
            } else {
                $this->error(trim($data)); // Show errors
            }
        }

        // Check if the process was successful
        if (!$process->isSuccessful()) {
            $this->error('❌ Failed: ' . $process->getErrorOutput());
            return self::FAILURE;
        }

        $this->info('✅ Script ran successfully');
        return self::SUCCESS;
    }
}
