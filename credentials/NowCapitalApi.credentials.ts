import {
    IAuthenticateGeneric,
    ICredentialTestRequest,
    ICredentialType,
    INodeProperties,
} from 'n8n-workflow';

export class NowCapitalApi implements ICredentialType {
    name = 'nowCapitalApi';
    displayName = 'NowCapital API';
    documentationUrl = 'https://nowcapital.ca';

    properties: INodeProperties[] = [
        {
            displayName: 'API Key',
            name: 'apiKey',
            type: 'string',
            typeOptions: {
                password: true,
            },
            default: '',
            required: true,
            description: 'Your NowCapital.ca API key. Get one at https://nowcapital.ca (API Access section).',
        },
    ];

    authenticate: IAuthenticateGeneric = {
        type: 'generic',
        properties: {
            headers: {
                'x-api-key': '={{$credentials.apiKey}}',
            },
        },
    };

    test: ICredentialTestRequest = {
        request: {
            baseURL: 'https://api.nowcapital.ca',
            url: '/',
            method: 'GET',
        },
    };
}
