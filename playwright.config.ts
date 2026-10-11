import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/ui',workers:1,expect:{timeout:30000},timeout:180000,retries:0,use:{baseURL:'http://localhost:3210',trace:'retain-on-failure'},outputDir:'.test-output/results',reporter:'list'});
