const SITEDATA_QUERY = `
  query SiteData {
    siteDatas {
      displayName
      focus
      email
      linkedInHandle
      instagramHandle
    }
  }
`;

export default async function getSiteData() {
  const response = await fetch(process.env.CMS_ENDPOINT as string, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + process.env.CMS_TOKEN,
    },
    body: JSON.stringify({ query: SITEDATA_QUERY }),
  });
  const json = await response.json();
  return json.data.siteDatas[0];
}
