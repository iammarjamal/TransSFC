<?php

namespace TransSFC\TransSFC\Helpers;

use Illuminate\Support\Facades\Lang;
use Illuminate\Support\Facades\View;

if (! function_exists('transSFC')) {
    
    function transSFC(string $key, ?string $locale = null): string
    {
        $currentViewPath = View::shared('currentViewPath');
        $locale = $locale ?: app()->getLocale();

        if (!$currentViewPath) {
            return $key;
        }

        return Lang::has($currentViewPath, $locale)
            ? trans($currentViewPath, [], $locale)
            : $key;
    }
}