import {
    IAuthenticate,
    ICredentialTestRequest,
    ICredentialType,
    INodeProperties,
    Icon,
} from 'n8n-workflow';

export class NowCapitalApi implements ICredentialType {
    name = 'nowCapitalApi';
    displayName = 'NowCapital API';
    icon: Icon = 'file:nowcapital.svg';
    documentationUrl = 'https://nowcapital.ca/api-docs';
    properties: INodeProperties[] = [
        {
            displayName: 'API Key',
            name: 'apiKey',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            required: true,
            description: 'API Key from your NowCapital.ca account (API Access section)',
        },
        {
            displayName: 'Base URL',
            name: 'baseUrl',
            type: 'string',
            default: 'https://api.nowcapital.ca',
            description: 'The URL of your NowCapital API instance (default: https://api.nowcapital.ca)',
        },
    ];

    authenticate: IAuthenticate = {
        type: 'generic',
        properties: {
            headers: {
                'x-api-key': '={{$credentials.apiKey}}',
            },
        },
    };

    test: ICredentialTestRequest = {
        request: {
            method: 'GET',
            url: '={{$credentials.baseUrl}}/api-keys/status',
        },
    };
}
